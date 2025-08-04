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

	eq(other: MarginaliaWidget) {
		return this.sourcePath === other.sourcePath &&
			this.displayName === other.displayName &&
			this.footnoteNumber === other.footnoteNumber &&
			this.pos === other.pos;
	}

	toDOM(view: EditorView): HTMLElement {
		const supEl = createEl("sup", { cls: "escoli-footref-mark" });
		supEl.dataset.footnotenumber = `${this.footnoteNumber}`;

		this.noteEl = document.body.createDiv({ cls: "escoli-note" });
		const processedName = this.displayName.replace(/-/g, ' ');
		const headerText = `${this.footnoteNumber}: ${processedName}`;
		this.noteEl.createDiv({ cls: "escoli-note-header", text: headerText });
		this.contentEl = this.noteEl.createDiv({ cls: "escoli-note-content" });

		this.renderMarkdownContent();
		return supEl;
	}

	getLayoutInput(view: EditorView): { idealTop: number, height: number } | null {
		if (!this.noteEl) return null;
		const refCoords = view.coordsAtPos(this.pos);
		if (!refCoords) return null;

		return {
			idealTop: refCoords.top - (this.noteEl.offsetHeight / 2),
			height: this.noteEl.offsetHeight,
		};
	}

	applyPosition(top: number, view: EditorView) {
    if (!this.noteEl) return;
    const sizerEl = view.dom.querySelector(".cm-sizer");
    if (!sizerEl) return;

    // --- Logic to handle small margins ---
    const sizerRect = sizerEl.getBoundingClientRect();
    const sizerComputedStyle = window.getComputedStyle(sizerEl);
    const sizerMarginRight = parseFloat(sizerComputedStyle.marginRight) || 0;
    
    // Define constants for note sizing
    const MIN_NOTE_WIDTH = 100;
    const ORIGINAL_NOTE_WIDTH = 220;
    const NOTE_MARGIN = 20;
    
    const availableSpace = sizerMarginRight - NOTE_MARGIN;

    if (availableSpace < MIN_NOTE_WIDTH) {
        this.hide();
        return;
    }
    
    this.noteEl.style.width = `${Math.min(ORIGINAL_NOTE_WIDTH, availableSpace)}px`;
    // --- End of added logic ---
    
    const left = sizerRect.right + NOTE_MARGIN;

    this.noteEl.style.display = '';
    this.noteEl.style.left = `${left}px`;
    this.noteEl.style.top = `${top}px`;
}

	hide() {
		if (this.noteEl) this.noteEl.style.display = 'none';
	}

	private async renderMarkdownContent() {
		if (this.contentEl) {
			await MarkdownRenderer.render(this.app, this.content, this.contentEl, this.sourcePath ?? "", this.component);
			this.pluginView.scheduleLayout();
		}
	}

	destroy() {
		this.component.unload();
		this.noteEl?.remove();
	}
}

class EscoliViewPlugin {
	decorations: DecorationSet;
	private activeWidgets: MarginaliaWidget[] = [];
	private layoutTimeout: number | null = null;
	private component: Component;

	constructor(private view: EditorView, private plugin: EscoliPlugin) {
    this.component = new Component();
    this.decorations = Decoration.none;

    // Register all event listeners for layout updates
    this.component.registerDomEvent(this.view.scrollDOM, 'scroll', this.scheduleLayout);
    this.component.registerDomEvent(window, 'resize', this.scheduleLayout);
    this.component.registerEvent(
        this.plugin.app.workspace.on('active-leaf-change', this.scheduleLayout)
    );

    // Add a ResizeObserver on the editor sizer element for robust layout updates
    const sizerEl = this.view.dom.querySelector(".cm-sizer");
    if (sizerEl) {
        const observer = new ResizeObserver(this.scheduleLayout);
        observer.observe(sizerEl);
        // Ensure the observer is disconnected when the plugin view is destroyed
        this.component.register(() => observer.disconnect());
    }

    // Defer the initial dispatch to the next event loop tick. This allows the
    // initial view update to complete before we trigger a new one, avoiding the error.
    setTimeout(() => this.view.dispatch(), 0);
}
	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged || update.selectionSet) {
			this.updateDecorations();
		}
	}

	scheduleLayout = () => {
		if (this.layoutTimeout) window.clearTimeout(this.layoutTimeout);
		this.layoutTimeout = window.setTimeout(this.layoutMarginalia, 100);
	}

	updateDecorations() {
		this.activeWidgets = [];
		this.decorations = this.buildDecorations(this.view);
		this.scheduleLayout();
	}

	layoutMarginalia = () => {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile) {
			this.activeWidgets.forEach(w => w.hide());
			return;
		}

		const placedNotes: { top: number, bottom: number }[] = [];
		const PADDING_BETWEEN_NOTES = 5;

		for (const widget of this.activeWidgets) {
			if (widget.sourcePath !== activeFile.path) {
				widget.hide();
				continue;
			}

			const layoutInput = widget.getLayoutInput(this.view);
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
					if (finalTop < placed.bottom + PADDING_BETWEEN_NOTES && finalTop + height + PADDING_BETWEEN_NOTES > placed.top) {
						finalTop = placed.bottom + PADDING_BETWEEN_NOTES;
						adjusted = true;
						break;
					}
				}
			}

			widget.applyPosition(finalTop, this.view);
			placedNotes.push({ top: finalTop, bottom: finalTop + height });
		}
	}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const doc = view.state.doc;
		const footnotes = new Map<string, string>();
		const definitionLines = new Set<number>();
		const prefix = this.plugin.settings.prefix;
		const currentSelection = view.state.selection.main;
		const activeFilePath = this.plugin.app.workspace.getActiveFile()?.path;

		for (let i = 1; i <= doc.lines; i++) {
			const line = doc.line(i);
			const markerEndIndex = line.text.indexOf(']:');
			if (line.text.startsWith('[^') && markerEndIndex > 2) {
				const name = line.text.substring(2, markerEndIndex);
				if (name.startsWith(prefix)) {
					definitionLines.add(line.number);
					let content = [line.text.substring(markerEndIndex + 2).trimStart()];
					let nextLineNum = i + 1;
					while (nextLineNum <= doc.lines) {
						const nextLine = doc.line(nextLineNum);
						if (nextLine.text.trim() === "" || nextLine.text.startsWith("    ") || nextLine.text.startsWith("\t")) {
							content.push(nextLine.text.replace(/^(\s{4}|\t)/, ""));
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
					const selectionOverlaps = currentSelection.from < matchEnd && currentSelection.to > matchStart;

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
							this
						);
						this.activeWidgets.push(widget);

						builder.add(matchStart, matchEnd, Decoration.replace({ widget }));
					}
				}
			}
		}
		return builder.finish();
	}

	destroy() {
		this.component.unload();
	}
}

export function buildEscoliViewPlugin(plugin: EscoliPlugin) {
	return ViewPlugin.fromClass(
		// Pass the plugin instance into the ViewPlugin's constructor
		class extends EscoliViewPlugin {
			constructor(view: EditorView) {
				super(view, plugin);
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}