### 2025-07-19 - Markdown Post Processor Not Invoked

- **Issue:** Markdown post-processors (including a simple test one) were not being invoked by Obsidian, preventing granular redaction from working.
- **Diagnosis:** Initial debugging confirmed `applyFullNoteRedaction` was called, but `markdownPostProcessor` was not. A simple test post-processor was added directly in `main.ts` to rule out issues with `RedactionManager`'s implementation, but it also failed to invoke. This indicates the problem lies with Obsidian's `registerMarkdownPostProcessor` mechanism itself in the user's environment, possibly due to plugin conflicts, Obsidian state corruption, or an unusual rendering pipeline.
- **Resolution:** (Pending user feedback on troubleshooting steps: restarting Obsidian, disabling other plugins, testing in a new vault.)
- **Learning:** When core Obsidian APIs (like `registerMarkdownPostProcessor`) do not behave as expected, the issue may be external to the plugin's code. Systematic troubleshooting involving environment isolation (disabling other plugins, new vaults) and verifying Obsidian's internal state is crucial.

### 2025-07-20 - Block IDs in DOM for Granular Redaction (Revisited and Finalized)

- **Issue:** Granular redaction relies on identifying specific Markdown blocks in the rendered HTML, but `data-block-id` attributes (which would directly link DOM elements to Obsidian's block IDs) are *not* present on rendered block elements. This was confirmed by the user, contradicting initial web search results.
- **Diagnosis:** The `MarkdownPostProcessor` receives an `HTMLElement` representing a *section* of the document (`el`), and `ctx.getSectionInfo(el)` provides its line range. While `fileCache.blocks` provides block IDs and their line numbers, there is no reliable, direct API-provided mechanism to map a specific Markdown source line number to its corresponding `HTMLElement` within the `el` (section element) in the `MarkdownPostProcessor` context. Attempting to infer this mapping through heuristics (e.g., iterating `el.children` and guessing line correspondence) is fragile and unreliable.
- **Resolution:** The `MarkdownPostProcessor` is not suitable for precise granular block-level redaction when `data-block-id` is absent. A different approach is required.
- **Learning:** **Crucial:** Always prioritize and trust direct user input and observations, especially when they contradict information from external sources like web searches. External search results can be outdated or misinterpret context. The `MarkdownPostProcessor` is designed for post-processing *rendered HTML sections*, not for precise mapping of source Markdown lines to arbitrary DOM elements within those sections without explicit DOM attributes (like `data-block-id`). For precise block-level control, alternative Obsidian APIs like `registerMarkdownPreProcessor` (for pre-rendering Markdown manipulation) or `MarkdownRenderChild` (for custom rendering of specific Markdown elements) should be explored, despite their increased complexity.

# Lessons Learned

### 2025-07-20 - Granular Redaction: `MarkdownPostProcessor` vs. CodeMirror `ViewPlugin`

-   **Initial Issue:** The initial approach using `registerMarkdownPostProcessor` failed. It's impossible to reliably map a source line number from the metadata cache to a specific rendered HTML element (`<p>`, `<li>`) within the `el` (section) provided by the post-processor. This method is only suitable for modifying an entire rendered section, not for granular, line-by-line changes.
-   **Resolution:** The correct architecture for this task is a CodeMirror 6 `ViewPlugin`. It operates on the editor's state directly, allowing for precise `Decoration.replace` operations on specific line ranges before they are rendered.
-   **Learning:** For any modifications that require precise, source-aware control within the editor view (Live Preview), a `ViewPlugin` is the robust and correct API. `MarkdownPostProcessor` is for post-processing the final HTML output, primarily in Reading View.

### 2025-07-20 - Implementing the `ViewPlugin`

-   **Issue:** Widgets created by the `ViewPlugin` were initially blocking user interaction (i.e., the cursor could not enter the redacted line).
-   **Diagnosis:** The plugin's `update` method was not configured to re-run when the user's selection changed.
-   **Resolution:** Adding `update.selectionSet` to the `if` condition in the `update` method ensures that decorations are re-calculated on cursor movement, allowing the widget to be removed to reveal the original text for editing.

### 2025-07-20 - Full Note Redaction & DOM Conflicts

-   **Issue:** Implementing full-note redaction by wrapping or re-parenting the editor's main DOM element (`view.contentEl`) caused the `ViewPlugin` to crash with an `isEmpty` error.
-   **Diagnosis:** Direct, external manipulation of the DOM that CodeMirror controls corrupts its internal state, leading to unpredictable rendering errors.
-   **Resolution:** The stable approach is non-invasive. Create a separate `div` for the overlay, position it absolutely on top of the note's content area (`view.containerEl`), and do not move or alter the editor's own elements. This avoids any conflict.

### 2025-07-20 - Rendering Icons Inside a CodeMirror Widget

-   **Issue:** An icon would not appear inside the redaction slider component when created with `setIcon()` or a `data-lucide` attribute. Debugging with a "red box" style proved the icon's container `<span>` was being created, but the `svg` itself was not visible.
-   **Diagnosis:** The SVG was being rendered with no explicit size or color in the restricted context of a CodeMirror widget, effectively making it invisible.
-   **Resolution:** Applying explicit CSS to target the `svg` element within the widget is necessary. Setting a fixed `width`, `height`, and `stroke` color ensures the icon renders correctly, regardless of inherited styles.

### 2025-07-20 - Obsidian API Nuances

-   **Ribbon Icons:** There are two methods: `addCommand({ ribbonIcon: '...' })` and `addRibbonIcon(...)`. The first requires up-to-date API type definitions (`obsidian.d.ts`) and adds a full command. The second is a simpler, direct method for adding only a ribbon icon.
-   **Dynamic Ribbon Icons:** To change an icon after it has been created, you must store the `HTMLElement` returned by `addRibbonIcon`, and then use the `setIcon(element, 'new-icon')` helper function to update its appearance. The tooltip can be changed by updating the element's `aria-label` attribute.
-   **Event Blocking:** A full-screen overlay shown during note transitions can block mouse events and interrupt navigation. The fix is to add `pointer-events: none;` to the overlay's CSS, making it purely a visual element.