/* Fuksia for Gmail — Copyright (c) 2026 BURU labs — MIT License.
 *
 * Dark theme without inverting the page. Most of Gmail's chrome hard-codes light colors
 * in its own stylesheets, so this script reads each stylesheet once when it appears and
 * writes a companion stylesheet right after it with every color remapped:
 *   - light backgrounds become dark, dark text becomes light, borders follow;
 *   - Gmail's blue accents become fuchsia;
 *   - colors that are already "dark-theme" (dark backgrounds, light text) are kept.
 * The companion repeats the original selector and priority, so the cascade between
 * Gmail's own rules (hover, selected, disabled...) is preserved exactly.
 * Images are never touched, and nothing runs again until Gmail adds a new stylesheet.
 */
(() => {
  // Gmail itself, or a Google app embedded in Gmail's side panel (Calendar, Keep, Tasks,
  // Contacts, Chat). Those same apps opened in their own tab are left untouched.
  const isTop = window.top === window;
  const insideGmail = () => [...(window.location.ancestorOrigins || [])].some((o) => o.startsWith('https://mail.google.'));
  if (isTop ? !location.hostname.startsWith('mail.google.') : !insideGmail()) return;

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // Side-panel frames do not get fuksia.css (it would also hit those apps in their own
  // tabs), so they receive the base palette from here.
  if (!isTop) {
    const base = document.createElement('style');
    base.id = 'fuksia-base';
    base.textContent = `@media (prefers-color-scheme: dark){:root{color-scheme:dark!important;accent-color:#D85A74;
      --gm3-sys-color-surface:#1b1b1c!important;--gm3-sys-color-surface-container-low:#1b1b1c!important;
      --gm3-sys-color-surface-container:#222224!important;--gm3-sys-color-surface-container-high:#2a2a2d!important;
      --gm3-sys-color-surface-container-highest:#333337!important;--gm3-sys-color-on-surface:#e3e3e3!important;
      --gm3-sys-color-on-surface-variant:#c4c7c5!important;--gm3-sys-color-outline:#8e918f!important;
      --gm3-sys-color-outline-variant:#444746!important;--gm3-sys-color-primary:#F28FA6!important;
      --gm3-sys-color-on-primary:#3b0a17!important;--gm3-sys-color-primary-container:#5c1a2c!important;
      --gm3-sys-color-on-primary-container:#ffd9e0!important;--gm3-sys-color-secondary-container:#4a2530!important;
      --gm3-sys-color-on-secondary-container:#ffd9e0!important}
      html,body{background-color:#1b1b1c!important;color:#e3e3e3}}`;
    document.documentElement.appendChild(base);
  }
  const OVERRIDE_CLASS = 'fuksia-override';
  // Message bodies and the compose editor keep the email's own design: fuksia.css inverts
  // them as a block, so Gmail's rules inside them must not be remapped a second time.
  const SKIP_SELECTOR = /\.a3s\b|\.ii\.gt\b|\.editable\b|gmail_(?:signature|quote)/;
  const ACCENT_HUE = 348;   // hue of #D85A74
  // Google encodes the tone in icon file names: nv700, p900, black, grey600... are dark,
  // single-color glyphs drawn for a light background.
  const MONOCHROME_ICON = /gstatic\.com\/[^"')]*icons\/[^"')]*_(?:nv\d{3}|p900|black|grey\d{3}|gm_grey)_/;

  /* ---------- Color parsing ---------- */

  const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
  const COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
  const HAS_COLOR = /#[0-9a-f]{3,8}\b|rgba?\(|\b(?:white|black)\b/i;

  const parseColor = (text) => {
    const s = text.trim().toLowerCase();
    if (NAMED[s]) return NAMED[s].slice();
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      const n = parseInt(h, 16);
      return h.length === 6
        ? [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
        : [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, (n & 255) / 255];
    }
    const m = /^rgba?\(([^)]*)\)$/.exec(s);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.some(p => p.includes('var'))) return null;
    const num = (p, scale) => (p.endsWith('%') ? parseFloat(p) * scale / 100 : parseFloat(p));
    return [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), parts[3] !== undefined ? num(parts[3], 1) : 1];
  };

  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  };

  const hslToRgb = (h, s, l) => {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  };

  /* ---------- Remapping ---------- */

  // Lightness curves per role. Each keeps colors that already suit a dark theme.
  const LIGHTNESS = {
    bg: (l) => (l >= 0.5 ? 0.075 + (1 - l) * 0.5 : 0.04 + l * 0.65),
    fg: (l) => (l <= 0.6 ? 0.9 - l * 0.55 : l),
    border: (l) => (l >= 0.4 ? 0.18 + (1 - l) * 0.35 : 0.5 - l * 0.3),
  };

  const cache = new Map();

  const mapColor = (text, role) => {
    const key = role + text;
    let out = cache.get(key);
    if (out !== undefined) return out;
    const c = parseColor(text);
    if (!c || c[3] === 0) {
      out = text;
    } else {
      let [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      // HSL saturation explodes near white (#f8fafd reads as 60 % saturated), so the real
      // amount of color is judged by chroma. Near-greys become pure greys, and only clearly
      // colored blues (links, primary buttons, selection, focus) become fuchsia.
      const chroma = (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) / 255;
      if (chroma < 0.1) s = 0;
      else if (h >= 195 && h <= 240 && chroma >= 0.2) h = ACCENT_HUE;
      l = LIGHTNESS[role](l);
      // Very saturated pastels would glow once darkened; tone them down a little.
      if (role === 'bg' && s > 0.6) s = 0.6;
      const [r, g, b] = hslToRgb(h, s, l);
      const a = Math.round(c[3] * 1000) / 1000;
      out = a < 1
        ? `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
        : `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
    cache.set(key, out);
    return out;
  };

  const mapValue = (value, role) => value.replace(COLOR_RE, (m) => mapColor(m, role));

  const roleOf = (prop) => {
    if (prop.startsWith('--')) {
      if (/(^|-)on-|text|icon|foreground|fg/.test(prop)) return 'fg';
      if (/outline|border|divider|stroke/.test(prop)) return 'border';
      if (/surface|background|container|bg|fill|scrim/.test(prop)) return 'bg';
      return null;
    }
    if (prop === 'background-color' || prop === 'background-image' || prop === 'background') return 'bg';
    if (prop === 'color' || prop === 'fill' || prop === 'stroke' || prop === 'caret-color' ||
        prop === 'text-decoration-color' || prop === '-webkit-text-fill-color') return 'fg';
    if (prop.startsWith('border') || prop.startsWith('outline') || prop === 'column-rule-color') return 'border';
    return null;
  };

  /* ---------- Stylesheet companions ---------- */

  const convertRules = (rules, out) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const sel = rule.selectorText;
        if (SKIP_SELECTOR.test(sel)) continue;
        const st = rule.style;
        let decl = '';
        for (let i = 0; i < st.length; i++) {
          const prop = st[i];
          const role = roleOf(prop);
          if (!role) continue;
          const value = st.getPropertyValue(prop);
          if (!value || !HAS_COLOR.test(value)) continue;
          const mapped = mapValue(value, role);
          if (mapped !== value) decl += `${prop}:${mapped}${st.getPropertyPriority(prop) ? ' !important' : ''};`;
        }
        // Gmail's UI glyphs are dark single-tone PNG sprites; flip them to light. Colored
        // artwork (logos, avatars, label dots) has no dark-tone token and is left alone.
        if (MONOCHROME_ICON.test(st.backgroundImage) || MONOCHROME_ICON.test(st.content)) {
          decl += 'filter:invert(1) hue-rotate(180deg);';
        } else if (!st.filter && (/url\(/.test(st.backgroundImage) || /url\(/.test(st.content))) {
          // A state that swaps in colored artwork (the yellow star, the important marker)
          // must drop the flip a less specific rule gave the same element.
          decl += 'filter:none;';
        }
        if (decl) out.push(`${sel}{${decl}}`);
      } else if (rule instanceof CSSMediaRule) {
        const inner = [];
        convertRules(rule.cssRules, inner);
        if (inner.length) out.push(`@media ${rule.conditionText}{${inner.join('')}}`);
      } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
        const inner = [];
        convertRules(rule.cssRules, inner);
        if (inner.length) out.push(`@supports ${rule.conditionText}{${inner.join('')}}`);
      }
    }
  };

  const companions = new WeakMap();

  const isOwn = (node) => node.classList && (node.classList.contains(OVERRIDE_CLASS) || node.id === 'fuksia-base');
  const inMessage = (node) => !!(node.closest && node.closest('.a3s, .ii.gt, .editable'));

  // The Google bar (search box, account menu) comes from a gstatic.com <link>, which the
  // CSSOM refuses to expose cross-origin. It is served with CORS, so it is fetched and
  // parsed into a detached stylesheet instead. Fonts and anything without CORS are skipped.
  const fetched = new Map();
  const readCrossOrigin = (node) => {
    const href = node.href;
    if (!href || /fonts\.googleapis\.com/.test(href)) return;
    if (!fetched.has(href)) {
      fetched.set(href, fetch(href, { mode: 'cors', credentials: 'omit' })
        .then((r) => (r.ok ? r.text() : ''))
        .then((text) => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(text.replace(/@import[^;]*;/g, ''));
          return sheet.cssRules;
        })
        .catch(() => null));
    }
    fetched.get(href).then((rules) => {
      if (rules && node.isConnected) writeCompanion(node, rules);
    });
  };

  const processSheet = (node) => {
    if (isOwn(node) || inMessage(node)) return;
    let rules;
    try {
      rules = node.sheet && node.sheet.cssRules;
    } catch (e) {
      readCrossOrigin(node);
      return;
    }
    if (rules) writeCompanion(node, rules);
  };

  const writeCompanion = (node, rules) => {
    const out = [];
    convertRules(rules, out);
    let companion = companions.get(node);
    if (!out.length) {
      if (companion) companion.remove();
      return;
    }
    if (!companion) {
      companion = document.createElement('style');
      companion.className = OVERRIDE_CLASS;
      companions.set(node, companion);
    }
    companion.media = darkQuery.matches ? 'all' : 'not all';
    const css = out.join('\n');
    if (companion.textContent !== css) companion.textContent = css;
    if (node.nextSibling !== companion) node.after(companion);
  };

  const handleNode = (node) => {
    if (node.nodeType !== 1) return;
    if (node.localName === 'style') {
      processSheet(node);
    } else if (node.localName === 'link' && /stylesheet/i.test(node.rel)) {
      if (node.sheet) processSheet(node);
      node.addEventListener('load', () => processSheet(node), { once: true });
    } else if (node.firstElementChild && node.localName !== 'svg') {
      node.querySelectorAll('style, link[rel~="stylesheet"]').forEach(handleNode);
    }
  };

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData' || (r.type === 'childList' && r.target.localName === 'style')) {
        const styleNode = r.target.nodeType === 1 ? r.target : r.target.parentNode;
        if (styleNode && styleNode.localName === 'style') processSheet(styleNode);
        continue;
      }
      r.addedNodes.forEach(handleNode);
      r.removedNodes.forEach((node) => {
        const companion = node.nodeType === 1 && companions.get(node);
        if (companion) companion.remove();
      });
    }
  });

  const start = () => {
    document.querySelectorAll('style, link[rel~="stylesheet"]').forEach(handleNode);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };

  // Follow the system theme live: companions are switched off rather than removed.
  darkQuery.addEventListener('change', () => {
    document.querySelectorAll('style.' + OVERRIDE_CLASS).forEach((s) => {
      s.media = darkQuery.matches ? 'all' : 'not all';
    });
  });

  start();
})();
