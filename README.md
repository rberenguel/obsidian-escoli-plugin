# Escoli: An Obsidian plugin for Marginalia

An Obsidian plugin to transform footnotes into elegant marginalia notes, inspired by the classic style of placing notes in the margins of books.

> **Escoli** is a Catalan word for a scholarly or explanatory note, a gloss, or a scholium. It reflects the plugin's purpose: to bring your annotations out of the footer and into the margin, where they are more accessible and contextually placed.

---

## Features

### Footnote-to-Marginalia Conversion

Automatically converts standard Markdown footnotes into clean, readable marginalia notes.

-   **How it Works:**
    1.  Write your footnotes using the standard Markdown syntax (`[^1]`, `[^note]`, etc.).
    2.  In Reading View, the plugin will automatically hide the default footnote list at the bottom of the page.
    3.  The content of each footnote is then displayed as a pop-up note in the right margin, next to the corresponding reference.

**Example Markdown:**
```markdown
Here is some text with a footnote.[^1]

And here is another one with a more descriptive name.[^note]

[^1]: This is the first footnote.
[^note]: This is the second, more descriptive footnote.
```

**Result:**
In reading view, the footnotes will appear as notes in the margin when you hover over them, rather than at the bottom of the page.

---

## Installation

### Manual Installation

1.  Download the latest release files (`main.js`, `styles.css`, `manifest.json`) from the **Releases** page of the GitHub repository (or the zip file, contains all of these).
2.  Find your Obsidian vault's plugins folder by going to `Settings` > `About` and clicking `Open` next to `Override config folder`. Inside that folder, navigate into the `plugins` directory.
3.  Create a new folder named `escoli`.
4.  Copy the `main.js`, `manifest.json`, and `styles.css` files into the new `escoli` folder.
5.  In Obsidian, go to **Settings** > **Community Plugins**.
6.  Make sure "Restricted mode" is turned off. Click the "Reload plugins" button.
7.  Find "Escoli" in the list and **enable** it.