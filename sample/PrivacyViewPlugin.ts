import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { MarkdownView } from "obsidian";
import PrivacyPlugin from "../main";
import { RedactionSliderComponent } from "./RedactionSliderComponent";

class RedactionWidget extends WidgetType {
	private blockId: string | null = null;

	constructor(
		private readonly lineText: string,
		private readonly plugin: PrivacyPlugin,
	) {
		super();
		const match = this.lineText.match(/\^([a-zA-Z0-9]+)$/);
		if (match) {
			this.blockId = match[1];
		}
	}

	toDOM(view: EditorView): HTMLElement {
		const container = document.createElement("div");
		const contentToHide = container.createDiv();

		// --- NEW: Clean the text before creating the component ---
		// Strip leading markdown list markers (- , *, 1., etc.)
		const cleanedText = this.lineText.replace(
			/^(\s*[-*+]|\s*\d+\.)\s+/,
			"",
		);
		contentToHide.textContent = cleanedText;
		// --- END OF CHANGE ---

		new RedactionSliderComponent(
			container,
			this.plugin.settings.redactionStyle,
			this.plugin,
			this.blockId,
		);
		return container;
	}

	ignoreEvent() {
		return true;
	}
}

export function buildPrivacyViewPlugin(plugin: PrivacyPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const activeView =
					plugin.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView || !activeView.file) {
					return Decoration.none;
				}

				const fileCache = plugin.app.metadataCache.getFileCache(
					activeView.file,
				);

				if (
					plugin.redactionManager.isFullNotePrivate(
						activeView.file,
						fileCache,
					)
				) {
					return Decoration.none;
				}

				const builder = new RangeSetBuilder<Decoration>();
				const privateBlockIds = fileCache?.frontmatter?.privacy;

				if (!privateBlockIds || !Array.isArray(privateBlockIds)) {
					return builder.finish();
				}

				const idSet = new Set(privateBlockIds);

				for (const { from, to } of view.visibleRanges) {
					let pos = from;
					while (pos <= to) {
						const line = view.state.doc.lineAt(pos);
						const blockIdMatch =
							line.text.match(/\s\^([a-zA-Z0-9]+)$/);

						if (blockIdMatch && idSet.has(blockIdMatch[1])) {
							const blockId = blockIdMatch[1];
							if (plugin.revealedBlockIds.has(blockId)) {
								pos = line.to + 1;
								continue; // Skip redacting this block
							}
							const selection = view.state.selection.main;
							if (
								!(
									selection.from <= line.to &&
									selection.to >= line.from
								)
							) {
								builder.add(
									line.from,
									line.to,
									Decoration.replace({
										widget: new RedactionWidget(
											line.text,
											plugin,
										),
									}),
								);
							}
						}
						pos = line.to + 1;
					}
				}
				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}
