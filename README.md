# Escoli: An Obsidian plugin for Marginalia

An Obsidian plugin to transform your footnotes into elegant, interactive marginalia notes directly in the Live Preview editor.

> **Escoli**: Catalan for a scholarly or explanatory note, a gloss, or a _scholium_.


---

## Features

Escoli enhances Obsidian's editor by turning a specific subset of your footnotes into a dynamic system for side notes.

* **Live Preview Marginalia**: Your footnote content appears automatically in the right-hand margin as you write, no need to switch to Reading View.
* **Editable Markers**: The footnote references in your text are replaced by clean, numbered markers (`‹1 ☞›`). Clicking on a marker instantly reveals the original `[^esc-note]` text so you can edit it seamlessly.
* **Smart Note Titles**: Marginal notes are automatically titled with a sequential number and the name of your reference. For example, a footnote named `[^esc-key-concept]` will appear in the margin with the title `1: KEY CONCEPT`.
* **Customizable Prefix**: You control which footnotes become marginalia. By default, only footnotes starting with `[^esc-...]` are transformed, but you can configure this prefix in the settings.
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
    [^esc-token-bucket]: A token bucket is an algorithm used in packet-switched computer networks and telecommunications networks. It can be used to check that data transmissions conform to defined limits on bandwidth and burstiness.
    ```
5.  Escoli will instantly render the reference as a numbered marker (`‹1 ☞›`) and display the content in a note in the right margin of your editor.

---

## Installation

### From the Community Plugins list

*(This is the recommended method.)*

1.  Go to **Settings** > **Community Plugins**.
2.  Click **Browse** and search for "Escoli".
3.  Click **Install**, and then once it's finished, click **Enable**.

### Manual Installation

1.  Download the latest release files (`main.js`, `styles.css`, `manifest.json`) from the **Releases** page of the GitHub repository.
2.  Go to your vault's plugins folder: **Settings** > **Community Plugins** > **Plugins folder** (click the folder icon).
3.  Create a new folder named `escoli`.
4.  Copy the three files you downloaded into the new `escoli` folder.
5.  In Obsidian, go back to **Settings** > **Community Plugins** and click the "Reload plugins" button.
6.  Find "Escoli" in the list and **enable** it.