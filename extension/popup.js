/* Fuksia for Gmail — Copyright (c) 2026 BURU labs — MIT License.
 * Extension menu: two settings saved in chrome.storage.sync. Open Gmail tabs pick up the
 * change at once (fuksia.js listens to chrome.storage.onChanged); no reload needed.
 */
const DEFAULTS = { dark: true, actions: 'default' };

const dark = document.getElementById('dark');
const actions = document.querySelectorAll('input[name="actions"]');

chrome.storage.sync.get(DEFAULTS).then((stored) => {
  dark.checked = stored.dark;
  actions.forEach((input) => { input.checked = input.value === stored.actions; });
});

dark.addEventListener('change', () => chrome.storage.sync.set({ dark: dark.checked }));
actions.forEach((input) => input.addEventListener('change', () => {
  if (input.checked) chrome.storage.sync.set({ actions: input.value });
}));
