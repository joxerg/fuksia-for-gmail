# Fuksia for Gmail

Dark theme for Gmail with fuchsia accents, by BURU labs. Follows your system dark mode.

Unlike filter-based dark modes, Fuksia does **not** invert the page:

- Gmail's Material 3 color variables are redefined with a dark, fuchsia palette (`fuksia.css`).
- Gmail's own stylesheets are read once when they load, and a companion stylesheet with every
  color remapped (light backgrounds → dark, dark text → light, blue accents → fuchsia) is placed
  right after each one (`fuksia.js`). Nothing runs again until Gmail adds a new stylesheet.
- Images, avatars, logos and label colors keep their exact colors. Only message bodies and the
  compose editor, which carry each email's own design, are inverted as a block.
- Side-panel apps (Calendar, Keep, Tasks, Contacts, Chat) get the same treatment when embedded in
  Gmail; opened in their own tab they are left untouched.

The palette lives at the top of `extension/fuksia.css` (`--fx-*` variables).

## Install (developer mode)

1. Go to `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.

Do not run it together with another Gmail dark-mode extension.

## Credits

The idea of telling Gmail's monochrome UI glyphs apart by the tone token in their file name
(`nv700`, `p900`, `grey600`...) comes from [Gmail Auto Dark Mode](https://github.com/renefs/gmail-auto-dark-mode)
by Rene Fernandez (MIT).

Gmail is a trademark of Google LLC. This project is not affiliated with or endorsed by Google.
