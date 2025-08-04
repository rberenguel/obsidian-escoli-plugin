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
	private scrollerEl: HTMLElement | null = null;
	private positionNoteHandler: (() => void) | null = null;
	private component: Component;

	constructor(
		private readonly name: string,
		private readonly content: string,
		private readonly pos: number,
		private readonly app: App,
		private readonly sourcePath: string | undefined,
	) {
		super();
		this.component = new Component();
		console.log(`Escoli: MarginaliaWidget created for: [^${name}] at pos ${pos}`);
	}

	eq(other: MarginaliaWidget) {
		const areEqual = this.name === other.name && this.content === other.content && this.pos === other.pos;
		console.log(`Escoli: eq called for [^${this.name}]. Are equal: ${areEqual}`);
		return areEqual;
	}

	toDOM(view: EditorView): HTMLElement { // Changed back to synchronous
		console.log(`Escoli: toDOM called for: [^${this.name}]`);
		const refEl = createSpan();
		refEl.createEl("sup", {
			text: `[^${this.name}]`,
			cls: "cm-footref",
		});

		this.noteEl = document.body.createDiv({ cls: "escoli-note" });

		// Trigger markdown rendering asynchronously, but don't await it here
		this.renderMarkdownContent();

		// Find the scroller and sizer elements
		const editorEl = view.dom;
		this.scrollerEl = editorEl.querySelector(".cm-scroller");
		const sizerEl = editorEl.querySelector(".cm-sizer");

		if (!this.scrollerEl || !sizerEl) {
			console.error("Escoli: Could not find .cm-scroller or .cm-sizer elements.");
			return refEl;
		}

		this.positionNoteHandler = () => {
			if (!this.noteEl || !this.scrollerEl) return;

			const refCoords = view.coordsAtPos(this.pos);
			if (!refCoords) {
				// Element is out of view or not rendered yet
				this.noteEl.style.display = 'none';
				return;
			} else {
				this.noteEl.style.display = '';
			}

			const sizerRect = sizerEl.getBoundingClientRect();

			// Calculate top based on the reference element's viewport position, centered vertically
			const top = refCoords.top + (refEl.offsetHeight / 2) - (this.noteEl.offsetHeight / 2);

			// Calculate left to be in the right margin of the sizer
			const left = sizerRect.right + 20; // 20px margin from the sizer's right edge

			this.noteEl.style.left = `${left}px`;
			this.noteEl.style.top = `${top}px`;
		};

		// Defer positioning until the next animation frame to ensure refEl has been rendered.
		requestAnimationFrame(() => {
			this.positionNoteHandler?.();
			// Add a small timeout as a fallback for initial rendering issues
			setTimeout(() => {
				this.positionNoteHandler?.();
			}, 200);
		});

		// Add scroll listener to reposition notes
		this.scrollerEl.addEventListener("scroll", this.positionNoteHandler);
		// Add resize listener to reposition notes
		window.addEventListener("resize", this.positionNoteHandler);

		return refEl;
	}

	private async renderMarkdownContent() {
		if (this.noteEl) {
			await MarkdownRenderer.render(
				this.app,
				this.content,
				this.noteEl,
				this.sourcePath ?? "",
				this.component,
			);
		}
	}

	destroy() {
		console.log(`Escoli: Destroying widget for: [^${this.name}]`);
		if (this.scrollerEl && this.positionNoteHandler) {
			this.scrollerEl.removeEventListener("scroll", this.positionNoteHandler);
		}
		if (this.positionNoteHandler) {
			window.removeEventListener("resize", this.positionNoteHandler);
		}
		this.component.unload();
		this.noteEl?.remove();
	}
}

export function buildEscoliViewPlugin(plugin: EscoliPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				console.log("Escoli: ViewPlugin constructed.");
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged) console.log("Escoli: update triggered by docChanged");
				if (update.viewportChanged) console.log("Escoli: update triggered by viewportChanged");
				if (update.selectionSet) console.log("Escoli: update triggered by selectionSet");

				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				console.log("Escoli: buildDecorations running...");
				const builder = new RangeSetBuilder<Decoration>();
				const doc = view.state.doc;
				const footnotes = new Map<string, string>();
				const definitionLines = new Set<number>();
				const prefix = plugin.settings.prefix;

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
								if (
									nextLine.text.trim() === "" ||
									nextLine.text.startsWith("    ") ||
									nextLine.text.startsWith("\t")
								) {
									content.push(
										nextLine.text.replace(/^(\s{4}|\t)/, "")
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

				if (footnotes.size > 0) {
					console.log("Escoli: Found footnotes:", footnotes);
				} else {
					return builder.finish();
				}

				const refRegex = /\[\^([^\]]+)\]/g;
				for (const { from, to } of view.visibleRanges) {
					const text = doc.sliceString(from, to);
					let match;
					while ((match = refRegex.exec(text))) {
						const name = match[1];
						const pos = from + match.index;
						const line = doc.lineAt(pos).number;

						if (footnotes.has(name) && !definitionLines.has(line)) {
							console.log(
								`Escoli: MATCH! Creating decoration for [^${name}] at line ${line}`
							);
							builder.add(
								pos,
								pos + match[0].length,
								Decoration.replace({
									widget: new MarginaliaWidget(
										name,
										footnotes.get(name)!,
										pos,
										plugin.app,
										plugin.app.workspace.getActiveFile()?.path
									),
								})
							);
						}
					}
				}

				const decorations = builder.finish();
				console.log("Escoli: Finished building decorations:", decorations.size);
				return decorations;
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}