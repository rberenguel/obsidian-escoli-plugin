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

class MarginaliaWidget extends WidgetType {
	private noteEl: HTMLElement | null = null;

	constructor(
		private readonly name: string,
		private readonly content: string
	) {
		super();
		console.log(`Escoli: MarginaliaWidget created for: [^${name}]`);
	}

	eq(other: MarginaliaWidget) {
		const areEqual = this.name === other.name && this.content === other.content;
		console.log(`Escoli: eq called for [^${this.name}]. Are equal: ${areEqual}`);
		return areEqual;
	}

	toDOM(view: EditorView): HTMLElement {
		console.log(`Escoli: toDOM called for: [^${this.name}]`);
		const refEl = createSpan();
		refEl.createEl("sup", {
			text: `[^${this.name}]`,
			cls: "cm-footref",
		});

		this.noteEl = document.body.createDiv({ cls: "escoli-note" });
		this.noteEl.innerHTML = this.content;

		const positionNote = () => {
			if (!this.noteEl) return;
			const rect = refEl.getBoundingClientRect();
			const noteWidth = this.noteEl.offsetWidth;
			const left = rect.right + 10;

			if (left + noteWidth > window.innerWidth) {
				this.noteEl.style.left = `${rect.left - noteWidth - 10}px`;
			} else {
				this.noteEl.style.left = `${left}px`;
			}
			this.noteEl.style.top = `${rect.top}px`;
		};

		refEl.addEventListener("mouseenter", () => {
			if (!this.noteEl) return;
			positionNote();
			this.noteEl.classList.add("is-visible");
		});

		refEl.addEventListener("mouseleave", () => {
			this.noteEl?.classList.remove("is-visible");
		});

		return refEl;
	}

	destroy() {
		console.log(`Escoli: Destroying widget for: [^${this.name}]`);
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
										footnotes.get(name)!
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