# Escoli: An Obsidian plugin for Marginalia

An Obsidian plugin to transform your footnotes into elegant, interactive marginalia notes directly in the Live Preview editor.

> **Escoli**: Catalan for a scholarly or explanatory note, a gloss, or a _scholium_.

![](https://raw.githubusercontent.com/rberenguel/obsidian-escoli-plugin/main/obsidian-escoli-plugin.png)

> [!WARNING]
> This plugin is still a bit unstable

---

## Features

Escoli enhances Obsidian's editor by turning a specific subset of your footnotes into a dynamic system for side notes.

* **Live Preview Marginalia**: Your footnote content appears automatically in the right-hand margin as you write, no need to switch to Reading View.
* **Editable Markers**: The footnote references in your text are replaced by clean, numbered markers (`‹1 ☞›`). Clicking on a marker instantly reveals the original `[^esc-note]` text so you can edit it seamlessly.
* **Smart Note Titles**: Marginal notes are automatically titled with a sequential number and the name of your reference. For example, a footnote named `[^esc-key-concept]` will appear in the margin with the title `1: KEY CONCEPT`.
* **Customizable Prefix**: You control which footnotes become marginalia. By default, only footnotes starting with `[^esc-...]` are transformed, but you can configure this prefix in the settings.
* **Configurable Note Placement**: By default, notes appear in the right margin. To place a specific note in the left margin (if space is available), simply start its identifier with `l-`. For example, `[^esc-l-my-left-note]`.
* **Clean Workspace**: The plugin automatically hides the standard footnote list at the bottom of the page in Reading View, keeping your notes tidy.

---

## How to Use

1.  **Install and enable** the Escoli plugin.
2.  (Optional) Navigate to **Settings → Escoli** to change the default footnote prefix from `esc-`.
3.  In a note, create a footnote reference using your chosen prefix. For example:
    ```markdown
    The concept of a token bucket is fundamental to rate limiting.[^esc-token-bucket]
    ```
4.  Define the content for your footnote at the bottom of the note, it is a normal footnote for any other purpose:
    ```markdown
    [^esc-token-bucket]: The Token Bucket algorithm is a flexible and efficient rate-limiting mechanism. It works by filling a bucket with tokens at a fixed rate (e.g., one token per second). Each request consumes a token, and if no tokens are available, the request is rejected.
    ```
5.  Escoli will render the reference as a numbered marker (`‹1 ☞›`) and display the content in a note in the right margin of your editor.

---

## Installation

### Manual Installation

1.  Download the latest release files (`main.js`, `styles.css`, `manifest.json`) from the **Releases** page of the GitHub repository.
2.  Go to your vault's plugins folder: **Settings** > **Community Plugins** > **Plugins folder** (click the folder icon).
3.  Create a new folder named `escoli`.
4.  Copy the three files you downloaded into the new `escoli` folder.
5.  In Obsidian, go back to **Settings** > **Community Plugins** and click the "Reload plugins" button.
6.  Find "Escoli" in the list and **enable** it.