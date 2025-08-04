import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import EscoliPlugin from "../main";
import { App, MarkdownRenderer, Component } from "obsidian";

class MarginaliaWidget extends WidgetType {
	noteEl: HTMLElement | null = null;
	public supEl: HTMLElement | null = null;
	private contentEl: HTMLElement | null = null;
	private component: Component;

	constructor(
		public readonly sourcePath: string | undefined,
		readonly pos: number,
		private readonly content: string,
		private readonly app: App,
		private readonly footnoteNumber: number,
		private readonly displayName: string,
		private readonly pluginView: EscoliViewPlugin,
	) {
		super();
		this.component = new Component();
	}

	eq(other: MarginaliaWidget): boolean {
		return (
			this.sourcePath === other.sourcePath &&
			this.displayName === other.displayName &&
			this.footnoteNumber === other.footnoteNumber &&
			this.content === other.content
		);
	}

	toDOM(view: EditorView): HTMLElement {
		this.pluginView.registerWidgetForLayout(this);

		this.supEl = createEl("sup", { cls: "escoli-footref-mark" });
		this.supEl.dataset.footnotenumber = `${this.footnoteNumber}`;

		this.noteEl = document.body.createDiv({ cls: "escoli-note" });
		const processedName = this.displayName.replace(/-/g, " ");
		const headerEl = this.noteEl.createDiv({
			cls: "escoli-note-header",
		});
		headerEl.createSpan({
			cls: "escoli-note-header-number",
			text: `${this.footnoteNumber}:`,
		});
		headerEl.createSpan({
			cls: "escoli-note-header-title",
			text: `${processedName}`,
		});

		this.contentEl = this.noteEl.createDiv({ cls: "escoli-note-content" });

		this.renderMarkdownContent();
		return this.supEl;
	}

	getLayoutInput(): { idealTop: number; height: number } | null {
		if (!this.supEl || !this.noteEl || this.noteEl.offsetHeight === 0) {
			return null;
		}
		const refRect = this.supEl.getBoundingClientRect();
		if (refRect.width === 0 && refRect.height === 0) {
			return null;
		}
		const noteHeight = this.noteEl.offsetHeight;
		return {
			idealTop: refRect.top - noteHeight / 2 + refRect.height / 2,
			height: noteHeight,
		};
	}

	/**
	 * Sets the position and visibility of the note.
	 * @returns {boolean} - True if the note was made visible, false otherwise.
	 */
	applyPosition(top: number, view: EditorView): boolean {
		if (!this.noteEl) {
			this.hide();
			return false;
		}

		const sizerEl = view.dom.querySelector(".cm-sizer");
		if (!sizerEl) {
			this.hide();
			return false;
		}

		const sizerComputedStyle = window.getComputedStyle(sizerEl);
		const sizerMarginRight =
			parseFloat(sizerComputedStyle.marginRight) || 0;
		const NOTE_MARGIN = 20;
		const MIN_NOTE_WIDTH = 100;
		const ORIGINAL_NOTE_WIDTH = 220;
		const availableSpace = sizerMarginRight - NOTE_MARGIN;

		if (availableSpace < MIN_NOTE_WIDTH) {
			this.hide();
			return false;
		}

		this.show();
		
		this.noteEl.style.width = `${Math.min(ORIGINAL_NOTE_WIDTH, availableSpace)}px`;
		
		const sizerRect = sizerEl.getBoundingClientRect();
		const left = sizerRect.right + NOTE_MARGIN;
		this.noteEl.style.left = `${left}px`;
		this.noteEl.style.top = `${top}px`;
		return true;
	}

	hide() {
		if (this.noteEl) {
			this.noteEl.style.opacity = "0";
		}
	}

	show() {
		if (this.noteEl) {
			this.noteEl.style.opacity = "1";
		}
	}

	private async renderMarkdownContent() {
		if (this.contentEl) {
			await MarkdownRenderer.render(
				this.app,
				this.content,
				this.contentEl,
				this.sourcePath ?? "",
				this.component,
			);
			this.pluginView.scheduleLayout();
		}
	}

	destroy() {
		this.pluginView.unregisterWidgetForLayout(this);
		this.component.unload();
		this.noteEl?.remove();
	}
}

class EscoliViewPlugin {
	decorations: DecorationSet;
	private widgetsForLayout: MarginaliaWidget[] = [];
	private layoutTimeout: number | null = null;
	private component: Component;

	constructor(
		private view: EditorView,
		private plugin: EscoliPlugin,
	) {
		this.component = new Component();
		this.decorations = this.buildDecorations(this.view);

		this.component.registerDomEvent(
			this.view.scrollDOM,
			"scroll",
			this.scheduleLayout
		);
		
		this.component.registerDomEvent(window, "resize", this.scheduleLayout);
		
		this.component.registerEvent(
			this.plugin.app.workspace.on(
				"active-leaf-change",
				() => {
					this.decorations = this.buildDecorations(this.view);
					this.scheduleLayout();
				}
			),
		);
	}
	
	update(update: ViewUpdate) {
		if (
			update.docChanged ||
			update.viewportChanged ||
			update.geometryChanged ||
            update.selectionSet
		) {
			this.decorations = this.buildDecorations(update.view);
            this.scheduleLayout();
		}
	}

    registerWidgetForLayout(widget: MarginaliaWidget) {
        this.widgetsForLayout.push(widget);
    }

    unregisterWidgetForLayout(widget: MarginaliaWidget) {
        this.widgetsForLayout = this.widgetsForLayout.filter(w => w !== widget);
    }

	scheduleLayout = () => {
		if (this.layoutTimeout) window.clearTimeout(this.layoutTimeout);
		this.layoutTimeout = window.setTimeout(this.layoutMarginalia, 50);
	};

	layoutMarginalia = () => {
		const placedNotes: { top: number; bottom: number }[] = [];
		const PADDING_BETWEEN_NOTES = 5;

		this.widgetsForLayout.sort((a, b) => a.pos - b.pos);

		for (const widget of this.widgetsForLayout) {
			const layoutInput = widget.getLayoutInput();
			if (!layoutInput) {
				widget.hide();
				continue;
			}

			let { idealTop, height } = layoutInput;
			let finalTop = idealTop;

			let adjusted = true;
			while (adjusted) {
				adjusted = false;
				for (const placed of placedNotes) {
					if (
						finalTop < placed.bottom + PADDING_BETWEEN_NOTES &&
						finalTop + height + PADDING_BETWEEN_NOTES > placed.top
					) {
						finalTop = placed.bottom + PADDING_BETWEEN_NOTES;
						adjusted = true;
						break;
					}
				}
			}

			const isVisible = widget.applyPosition(finalTop, this.view);

			// Only add visible notes to the collision map.
			if (isVisible) {
				placedNotes.push({ top: finalTop, bottom: finalTop + height });
			}
		}
	};

	buildDecorations(view: EditorView): DecorationSet {
        if (view.visibleRanges.length === 0 && view.state.doc.length > 0) {
            return this.decorations;
        }

		const builder = new RangeSetBuilder<Decoration>();
		const doc = view.state.doc;
		const footnotes = new Map<string, string>();
		const definitionLines = new Set<number>();
		const prefix = this.plugin.settings.prefix;
		const currentSelection = view.state.selection.main;
		const activeFilePath = this.plugin.app.workspace.getActiveFile()?.path;

		for (let i = 1; i <= doc.lines; i++) {
			const line = doc.line(i);
			const markerEndIndex = line.text.indexOf("]:");
			if (line.text.startsWith("[^") && markerEndIndex > 2) {
				const name = line.text.substring(2, markerEndIndex);
				if (name.startsWith(prefix)) {
					definitionLines.add(line.number);
					let content = [
						line.text.substring(markerEndIndex + 2).trimStart(),
					];
					let nextLineNum = i + 1;
					while (nextLineNum <= doc.lines) {
						const nextLine = doc.line(nextLineNum);
						if (
							nextLine.text.trim() === "" ||
							nextLine.text.startsWith("    ") ||
							nextLine.text.startsWith("\t")
						) {
							content.push(
								nextLine.text.replace(/^(\s{4}|\t)/, ""),
							);
							definitionLines.add(nextLine.number);
							nextLineNum++;
						} else {
							break;
						}
					}
					footnotes.set(name, content.join("\n").trim());
					i = nextLineNum - 1;
				}
			}
		}

		if (footnotes.size === 0) return builder.finish();

		const refRegex = /\[\^.+?\]/g;
		const displayedFootnotes = new Map<string, number>();
		let footnoteCounter = 1;

		for (const { from, to } of view.visibleRanges) {
			const text = doc.sliceString(from, to);
			let match;
			while ((match = refRegex.exec(text))) {
				const name = match[0].substring(2, match[0].length - 1);
				const matchStart = from + match.index;
				const matchEnd = matchStart + match[0].length;
				const line = doc.lineAt(matchStart).number;

				if (footnotes.has(name) && !definitionLines.has(line)) {
					const selectionOverlaps =
						currentSelection.from < matchEnd &&
						currentSelection.to > matchStart;

					if (!selectionOverlaps) {
						if (!displayedFootnotes.has(name)) {
							displayedFootnotes.set(name, footnoteCounter++);
						}
						const footnoteNumber = displayedFootnotes.get(name)!;
						const displayName = name.substring(prefix.length);

						const widget = new MarginaliaWidget(
							activeFilePath,
							matchStart,
							footnotes.get(name)!,
							this.plugin.app,
							footnoteNumber,
							displayName,
							this,
						);
						
						builder.add(
							matchStart,
							matchEnd,
							Decoration.replace({ widget }),
						);
					}
				}
			}
		}
		return builder.finish();
	}

	destroy() {
		this.component.unload();
		[...this.widgetsForLayout].forEach(w => w.destroy());
	}
}

export function buildEscoliViewPlugin(plugin: EscoliPlugin) {
	return ViewPlugin.fromClass(
		class extends EscoliViewPlugin {
			constructor(view: EditorView) {
				super(view, plugin);
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}