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

class FootnoteDefWidget extends WidgetType {
	constructor(
		private readonly footnoteNumber: number,
		private readonly displayName: string,
	) {
		super();
	}

	eq(other: FootnoteDefWidget): boolean {
		return (
			this.footnoteNumber === other.footnoteNumber &&
			this.displayName === other.displayName
		);
	}

	toDOM(view: EditorView): HTMLElement {
		const el = createEl("span", {
			cls: "escoli-footdef-mark",
			text: `<${this.footnoteNumber}: ${this.displayName.toUpperCase()} 👁>`,
		});
		return el;
	}
}

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
		public readonly position: "left" | "right",
	) {
		super();
		this.component = new Component();
	}

	eq(other: MarginaliaWidget): boolean {
		return (
			this.sourcePath === other.sourcePath &&
			this.displayName === other.displayName &&
			this.footnoteNumber === other.footnoteNumber &&
			this.content === other.content &&
			this.position === other.position
		);
	}

	toDOM(view: EditorView): HTMLElement {
		this.pluginView.registerWidgetForLayout(this);

		this.supEl = createEl("sup", { cls: "escoli-footref-mark" });
		this.supEl.dataset.footnotenumber = `${this.footnoteNumber}`;

		this.noteEl = view.scrollDOM.createDiv({ cls: "escoli-note" });
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

		const scrollerRect = this.pluginView.view.scrollDOM.getBoundingClientRect();
		const scrollTop = this.pluginView.view.scrollDOM.scrollTop;
		const idealTopInScroller = refRect.top - scrollerRect.top + scrollTop;

		const noteHeight = this.noteEl.offsetHeight;
		return {
			idealTop:
				idealTopInScroller - noteHeight / 2 + refRect.height / 2,
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
		const NOTE_MARGIN = 20;
		const MIN_NOTE_WIDTH = 100;
		const ORIGINAL_NOTE_WIDTH = 220;

		let availableSpace: number;
		if (this.position === "right") {
			availableSpace =
				parseFloat(sizerComputedStyle.marginRight) || 0;
		} else {
			availableSpace =
				parseFloat(sizerComputedStyle.marginLeft) || 0;
		}
		availableSpace -= NOTE_MARGIN;

		if (availableSpace < MIN_NOTE_WIDTH) {
			this.hide();
			return false;
		}

		this.show();

		const noteWidth = Math.min(ORIGINAL_NOTE_WIDTH, availableSpace);
		this.noteEl.style.width = `${noteWidth}px`;

		const sizerRect = sizerEl.getBoundingClientRect();
		const scrollerRect = view.scrollDOM.getBoundingClientRect();

		if (this.position === "right") {
			const left = sizerRect.right - scrollerRect.left + NOTE_MARGIN;
			this.noteEl.style.left = `${left}px`;
		} else {
			const right = sizerRect.left - scrollerRect.left - NOTE_MARGIN;
			this.noteEl.style.left = `${right - noteWidth}px`;
		}
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
	private footnoteDefs = new Map<string, string>();
	private footnoteDefLocations = new Map<
		string,
		{ from: number; to: number }
	>();

	constructor(
		public view: EditorView,
		private plugin: EscoliPlugin,
	) {
		this.component = new Component();
		this.parseFootnotes(this.view.state.doc);
		this.decorations = this.buildDecorations(this.view);

		this.component.registerDomEvent(
			this.view.scrollDOM,
			"scroll",
			this.scheduleLayout,
		);

		this.component.registerDomEvent(window, "resize", this.scheduleLayout);

		this.component.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.parseFootnotes(this.view.state.doc);
				this.decorations = this.buildDecorations(this.view);
				this.scheduleLayout();
			}),
		);
	}

	update(update: ViewUpdate) {
		const needsReparse = update.docChanged;
		const needsRedecorate =
			needsReparse ||
			update.viewportChanged ||
			update.geometryChanged ||
			update.selectionSet;

		if (needsReparse) {
			this.parseFootnotes(update.view.state.doc);
		}

		if (needsRedecorate) {
			const newDecorations = this.buildDecorations(update.view);
			// Only update decorations if the new set is not empty,
			// or if we can confirm there are no footnotes left in the document.
			// This prevents transient states during scrolling from wiping out the notes.
			if (newDecorations.size > 0 || this.footnoteDefs.size === 0) {
				this.decorations = newDecorations;
			}
		}

		// Always schedule a layout, as things might need to be repositioned
		// even if the decorations themselves haven't changed.
		this.scheduleLayout();
	}

	registerWidgetForLayout(widget: MarginaliaWidget) {
		this.widgetsForLayout.push(widget);
	}

	unregisterWidgetForLayout(widget: MarginaliaWidget) {
		this.widgetsForLayout = this.widgetsForLayout.filter(
			(w) => w !== widget,
		);
	}

	scheduleLayout = () => {
		if (this.layoutTimeout) window.clearTimeout(this.layoutTimeout);
		this.layoutTimeout = window.setTimeout(this.layoutMarginalia, 50);
	};

	layoutMarginalia = () => {
		const placedNotesLeft: { top: number; bottom: number }[] = [];
		const placedNotesRight: { top: number; bottom: number }[] = [];
		const PADDING_BETWEEN_NOTES = 5;

		this.widgetsForLayout.sort((a, b) => a.pos - b.pos);

		const leftWidgets = this.widgetsForLayout.filter(
			(w) => w.position === "left",
		);
		const rightWidgets = this.widgetsForLayout.filter(
			(w) => w.position === "right",
		);

		const layoutColumn = (
			widgets: MarginaliaWidget[],
			placedNotes: { top: number; bottom: number }[],
		) => {
			for (const widget of widgets) {
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
							finalTop <
								placed.bottom + PADDING_BETWEEN_NOTES &&
							finalTop + height + PADDING_BETWEEN_NOTES >
								placed.top
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
					placedNotes.push({
						top: finalTop,
						bottom: finalTop + height,
					});
				}
			}
		};

		layoutColumn(leftWidgets, placedNotesLeft);
		layoutColumn(rightWidgets, placedNotesRight);
	};

	parseFootnotes(doc: any) {
		this.footnoteDefs.clear();
		this.footnoteDefLocations.clear();
		const prefix = this.plugin.settings.prefix;

		for (let i = 1; i <= doc.lines; i++) {
			const line = doc.line(i);
			const markerEndIndex = line.text.indexOf("]:");
			if (line.text.startsWith("[^") && markerEndIndex > 2) {
				const name = line.text.substring(2, markerEndIndex);
				if (name.startsWith(prefix)) {
					const defStartPos = line.from;
					let defEndPos = line.to;

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
							defEndPos = nextLine.to;
							nextLineNum++;
						} else {
							break;
						}
					}
					this.footnoteDefs.set(name, content.join("\n").trim());
					this.footnoteDefLocations.set(name, {
						from: defStartPos,
						to: defEndPos,
					});
					i = nextLineNum - 1;
				}
			}
		}
	}

	buildDecorations(view: EditorView): DecorationSet {
		if (view.visibleRanges.length === 0 && view.state.doc.length > 0) {
			return this.decorations;
		}

		const builder = new RangeSetBuilder<Decoration>();
		const doc = view.state.doc;
		const prefix = this.plugin.settings.prefix;
		const currentSelection = view.state.selection.main;
		const activeFilePath = this.plugin.app.workspace.getActiveFile()?.path;

		if (this.footnoteDefs.size === 0) return builder.finish();

		// Create a set of definition start positions for efficient lookup
		const defStartPositions = new Set(
			Array.from(this.footnoteDefLocations.values()).map((loc) => loc.from),
		);

		const refRegex = /\[\^(.+?)\]/g;
		const displayedFootnotes = new Map<string, number>();
		let footnoteCounter = 1;

		// First pass: find all references in the visible range to determine which footnotes are active
		for (const { from, to } of view.visibleRanges) {
			const text = doc.sliceString(from, to);
			let match;
			while ((match = refRegex.exec(text))) {
				const name = match[1];
				const matchPos = from + match.index;

				// This is a definition, not a reference, so we skip it in this pass.
				if (defStartPositions.has(matchPos)) {
					continue;
				}

				if (this.footnoteDefs.has(name)) {
					if (!displayedFootnotes.has(name)) {
						displayedFootnotes.set(name, footnoteCounter++);
					}
				}
			}
		}

		// Second pass: build decorations for references
		for (const { from, to } of view.visibleRanges) {
			const text = doc.sliceString(from, to);
			let match;
			while ((match = refRegex.exec(text))) {
				const name = match[1];
				const matchStart = from + match.index;
				const matchEnd = matchStart + match[0].length;

				// It's a definition, not a reference. Skip.
				if (defStartPositions.has(matchStart)) {
					continue;
				}

				if (this.footnoteDefs.has(name)) {
					const selectionOverlaps =
						currentSelection.from < matchEnd &&
						currentSelection.to > matchStart;

					if (!selectionOverlaps && displayedFootnotes.has(name)) {
						const footnoteNumber = displayedFootnotes.get(name)!;
						let displayName = name.substring(prefix.length);
						let position: "left" | "right" = "right";
						if (displayName.startsWith("l-")) {
							position = "left";
							displayName = displayName.substring(2);
						}

						const widget = new MarginaliaWidget(
							activeFilePath,
							matchStart,
							this.footnoteDefs.get(name)!,
							this.plugin.app,
							footnoteNumber,
							displayName,
							this,
							position,
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

		// Third pass: decorate the definitions themselves
		for (const [
			name,
			{ from, to },
		] of this.footnoteDefLocations.entries()) {
			if (displayedFootnotes.has(name)) {
				const selectionOverlaps =
					currentSelection.from <= to && currentSelection.to >= from;

				if (!selectionOverlaps) {
					const footnoteNumber = displayedFootnotes.get(name)!;
					const displayName = name
						.substring(prefix.length)
						.replace(/^l-/, "");

					const firstLine = doc.lineAt(from);

					// Replace only the first line with the widget
					builder.add(
						firstLine.from,
						firstLine.to,
						Decoration.replace({
							widget: new FootnoteDefWidget(
								footnoteNumber,
								displayName,
							),
						}),
					);

					// Hide subsequent lines
					let currentPos = firstLine.to + 1;
					while (currentPos <= to) {
						const currentLine = doc.lineAt(currentPos);
						builder.add(
							currentLine.from,
							currentLine.from,
							Decoration.line({
								class: "escoli-hidden-line",
							}),
						);
						currentPos = currentLine.to + 1;
					}
				}
			}
		}

		return builder.finish();
	}

	destroy() {
		this.component.unload();
		[...this.widgetsForLayout].forEach((w) => w.destroy());
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
