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
	private noteEl: HTMLElement | null = null;
	private contentEl: HTMLElement | null = null;
	private scrollerEl: HTMLElement | null = null;
	private positionNoteHandler: (() => void) | null = null;
	private component: Component;
	private originalNoteWidth: number = 220;
	private readonly MIN_NOTE_WIDTH: number = 100;

	constructor(
		private readonly name: string,
		private readonly content: string,
		private readonly pos: number,
		private readonly app: App,
		private readonly sourcePath: string | undefined,
		private readonly footnoteNumber: number,
		private readonly displayName: string,
	) {
		super();
		this.component = new Component();
		// CHANGED: Use `registerEvent` to correctly manage the event listener lifecycle.
		this.component.registerEvent(
			this.app.workspace.on('active-leaf-change', this.updateNoteVisibility)
		);
	}

	eq(other: MarginaliaWidget) {
		// CHANGED: Added position check. This forces the widget to be
		// redrawn if the reference moves, even by one line.
		return this.name === other.name &&
			   this.displayName === other.displayName &&
			   this.footnoteNumber === other.footnoteNumber &&
			   this.pos === other.pos;
	}


	private updateNoteVisibility = () => {
		if (!this.noteEl) return;
		const activeFile = this.app.workspace.getActiveFile();
		const isNoteInActiveFile = activeFile && activeFile.path === this.sourcePath;

		if (isNoteInActiveFile) {
			this.positionNoteHandler?.();
		} else {
			this.noteEl.style.display = 'none';
		}
	}

	toDOM(view: EditorView): HTMLElement {
		const supEl = createEl("sup", { cls: "escoli-footref-mark" });
		supEl.dataset.footnotenumber = `${this.footnoteNumber}`;

		this.noteEl = document.body.createDiv({ cls: "escoli-note" });

		const processedName = this.displayName.replace(/-/g, ' ');

		const ht = this.noteEl.createDiv({
			cls: "escoli-note-header",

		});
		ht.createSpan({
			cls: "escoli-note-header-number",
			text: `${this.footnoteNumber}:`
		})
		ht.createSpan({
			cls: "escoli-note-header-title",
			text: `${processedName}`
		})

		this.contentEl = this.noteEl.createDiv({ cls: "escoli-note-content" });
		this.renderMarkdownContent();

		const editorEl = view.dom;
		this.scrollerEl = editorEl.querySelector(".cm-scroller");
		const sizerEl = editorEl.querySelector(".cm-sizer");

		if (!this.scrollerEl || !sizerEl) {
			return supEl;
		}

		const computedStyle = window.getComputedStyle(this.noteEl);
		this.originalNoteWidth = parseFloat(computedStyle.width) || 220;

		this.positionNoteHandler = () => {
			const activeFile = this.app.workspace.getActiveFile();
			const isNoteInActiveFile = activeFile && activeFile.path === this.sourcePath;
			
			if (!isNoteInActiveFile) {
				if(this.noteEl) this.noteEl.style.display = 'none';
				return;
			}

			if (!this.noteEl || !this.scrollerEl) return;
			const refCoords = view.coordsAtPos(this.pos);
			if (!refCoords) {
				this.noteEl.style.display = 'none';
				return;
			}
			this.noteEl.style.display = '';

			const sizerRect = sizerEl.getBoundingClientRect();
			const sizerComputedStyle = window.getComputedStyle(sizerEl);
			const sizerMarginRight = parseFloat(sizerComputedStyle.marginRight) || 0;
			const top = refCoords.top - (this.noteEl.offsetHeight / 2);
			const left = sizerRect.right + 20;
			const availableSpace = sizerMarginRight - 20;

			if (availableSpace < this.MIN_NOTE_WIDTH) {
				this.noteEl.style.display = 'none';
			} else {
				this.noteEl.style.display = '';
				this.noteEl.style.width = `${Math.min(this.originalNoteWidth, availableSpace)}px`;
			}

			this.noteEl.style.left = `${left}px`;
			this.noteEl.style.top = `${top}px`;
		};

		requestAnimationFrame(() => this.positionNoteHandler?.());

		this.scrollerEl.addEventListener("scroll", this.positionNoteHandler);
		window.addEventListener("resize", this.positionNoteHandler);

		return supEl;
	}

	private async renderMarkdownContent() {
		if (this.contentEl) {
			await MarkdownRenderer.render(this.app, this.content, this.contentEl, this.sourcePath ?? "", this.component);
		}
	}

	destroy() {
		this.component.unload();

		if (this.scrollerEl && this.positionNoteHandler) {
			this.scrollerEl.removeEventListener("scroll", this.positionNoteHandler);
		}
		if (this.positionNoteHandler) {
			window.removeEventListener("resize", this.positionNoteHandler);
		}
		this.noteEl?.remove();
	}
}

export function buildEscoliViewPlugin(plugin: EscoliPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const doc = view.state.doc;
				const footnotes = new Map<string, string>();
				const definitionLines = new Set<number>();
				const prefix = plugin.settings.prefix;
				const currentSelection = view.state.selection.main;

				for (let i = 1; i <= doc.lines; i++) {
					const line = doc.line(i);
					const match = line.text.match(/^\[\^([^\]]+)\]:\s*(.*)/);
					if (match) {
						const name = match[1];
						if (name.startsWith(prefix)) {
							definitionLines.add(line.number);
							let content = [match[2]];
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

				const refRegex = /\[\^([^\]]+)\]/g;
				const displayedFootnotes = new Map<string, number>();
				let footnoteCounter = 1;


				for (const { from, to } of view.visibleRanges) {
					const text = doc.sliceString(from, to);
					let match;
					while ((match = refRegex.exec(text))) {
						const name = match[1];
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
								const displayName = name.substring(plugin.settings.prefix.length);

								builder.add(
									matchStart,
									matchEnd,
									Decoration.replace({
										widget: new MarginaliaWidget(
											name,
											footnotes.get(name)!,
											matchStart,
											plugin.app,
											plugin.app.workspace.getActiveFile()?.path,
											footnoteNumber,
											displayName
										),
									})
								);
							}
						}
					}
				}
				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}