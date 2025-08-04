// main.ts

import {
	App,
	Plugin,
	WorkspaceLeaf,
	MarkdownView,
	Notice,
	TFile,
} from "obsidian";
import { SlidePreviewView } from "./SlidePreviewView";
import { SlidesModal } from "./SlidesModal";
import { getSlidesWithBoundaries, Slide } from "./Parser";
import { Exporter } from "./Exporter";

export default class SlidesPlugin extends Plugin {
	private previewViews: Map<string, SlidePreviewView> = new Map();
	private exporter: Exporter;
	private originalModes: Map<string, "source" | "preview"> = new Map();
	private lastActiveLeaf: WorkspaceLeaf | null = null;

	async onload() {
		this.exporter = new Exporter(this.app, this);

		this.addCommand({
			id: "toggle-slide-preview",
			name: "Toggle slide preview",
			icon: "projector",
			callback: () => {
				const leaf = this.app.workspace.activeLeaf;
				if (leaf?.view instanceof MarkdownView) {
					this.togglePreview(leaf);
				}
			},
		});

		this.addCommand({
			id: "export-presentation-as-html",
			name: "Export presentation as HTML (with JS)",
			icon: "download",
			callback: () => {
				this.exporter.exportPresentationAsHtml(false);
			},
		});

		this.addCommand({
			id: "export-presentation-as-html-css-only",
			name: "Export presentation as HTML (CSS only)",
			icon: "file-code",
			callback: () => {
				this.exporter.exportPresentationAsHtml(true);
			},
		});

		this.addCommand({
			id: "show-full-slideset",
			name: "Show full slideset in modal",
			callback: () => {
				const activeView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file) {
					const file = activeView.file;
					const fileCache = this.app.metadataCache.getFileCache(file);
					const theme = fileCache?.frontmatter?.preso;

					this.app.vault.read(file).then((content) => {
						const allSlides = getSlidesWithBoundaries(content);
						new SlidesModal(
							this.app,
							allSlides,
							file.path,
							typeof theme === "string" ? theme : null,
						).open();
					});
				}
			},
		});

		this.app.workspace.onLayoutReady(() => {
			this.lastActiveLeaf = this.app.workspace.activeLeaf;
		});

		this.app.workspace.on(
			"active-leaf-change",
			this.handleActiveLeafChange.bind(this),
		);
		this.app.workspace.on(
			"layout-change",
			this.handleLayoutChange.bind(this),
		);
	}

	private togglePreview(leaf: WorkspaceLeaf) {
		if (leaf?.view instanceof MarkdownView) {
			if (this.previewViews.has(leaf.view.file?.path || "nope")) {
				this.previewViews.get(leaf.view.file?.path || "nope")?.toggle();
			} else {
				this.activateSlides(leaf);
			}
		}
	}

	onunload() {
		this.previewViews.forEach((view) => view.destroy());
		this.previewViews.clear();
		this.originalModes.forEach((mode, path) => {
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (
					leaf.view instanceof MarkdownView &&
					leaf.view.file?.path === path
				) {
					const state = leaf.view.getState();
					leaf.view.setState(
						{ ...state, mode: mode },
						{ history: false },
					);
				}
			});
		});
		this.originalModes.clear();
	}

	handleLayoutChange() {
		const leafPaths = new Set(
			this.app.workspace.getLeavesOfType("markdown").map((leaf) => {
				const view = leaf.view as MarkdownView;
				return view.file?.path ?? "";
			}),
		);

		for (const path of this.previewViews.keys()) {
			if (!leafPaths.has(path)) {
				this.previewViews.get(path)?.destroy();
				this.previewViews.delete(path);
			}
		}
	}

	handleActiveLeafChange(newLeaf: WorkspaceLeaf | null) {
		const oldLeaf = this.lastActiveLeaf;

		// Handle leaving a leaf
		if (
			oldLeaf &&
			oldLeaf.view instanceof MarkdownView &&
			oldLeaf.view.file
		) {
			const oldPath = oldLeaf.view.file.path;
			if (this.originalModes.has(oldPath)) {
				const originalMode = this.originalModes.get(oldPath);
				const state = oldLeaf.view.getState();
				oldLeaf.view.setState(
					{ ...state, mode: originalMode },
					{ history: false },
				);
				this.originalModes.delete(oldPath);
			}
		}

		// Handle entering a new leaf
		if (
			newLeaf &&
			newLeaf.view instanceof MarkdownView &&
			newLeaf.view.file
		) {
			const newFile = newLeaf.view.file;
			const fileCache = this.app.metadataCache.getFileCache(newFile);
			const isPreso = fileCache?.frontmatter?.preso;

			if (isPreso) {
				const view = newLeaf.view;
				const state = view.getState();
				const currentMode = state.mode;

				// Type guard to ensure mode is of the expected type
				if (currentMode === "source" || currentMode === "preview") {
					if (currentMode !== "source") {
						this.originalModes.set(newFile.path, currentMode);
						view.setState(
							{ ...state, mode: "source" },
							{ history: false },
						);
					}
				}

				if (
					!(this.app as any).isMobile &&
					!this.previewViews.has(newFile.path)
				) {
					this.activateSlides(newLeaf);
				}
			} else {
				this.deactivateSlides(newLeaf);
			}
		} else if (newLeaf) {
			this.deactivateSlides(newLeaf);
		}

		this.lastActiveLeaf = newLeaf;
	}

	private getImagePath(
		directiveValue: string | null,
		sourcePath: string,
	): string | null {
		if (!directiveValue) return null;
		const imageMatch = directiveValue.match(/!\[\[(.*?)\]\]/);
		if (imageMatch) {
			const imageName = imageMatch[1];
			const imageFile = this.app.metadataCache.getFirstLinkpathDest(
				imageName,
				sourcePath,
			);
			if (imageFile instanceof TFile) {
				return this.app.vault.getResourcePath(imageFile);
			}
		}
		return null;
	}

	private extractSlideExtras(
		slides: Slide[],
		currentSlideIndex: number,
		sourcePath: string,
	) {
		let footerText: string | null = null;
		let footerImage: string | null = null;
		let slideNumbers = false;
		let headerText: string | null = null;
		let headerImage: string | null = null;
		let topLeftIcon: string | null = null;
		let topRightIcon: string | null = null;

		for (let i = 0; i <= currentSlideIndex; i++) {
			const slide = slides[i];
			if ("footer" in slide.directives)
				footerText =
					slide.directives["footer"] === "empty"
						? null
						: slide.directives["footer"];
			if ("footer-image" in slide.directives)
				footerImage =
					slide.directives["footer-image"] === "empty"
						? null
						: slide.directives["footer-image"];
			if ("slidenumbers" in slide.directives)
				slideNumbers = slide.directives["slidenumbers"] === "true";
			if ("header" in slide.directives)
				headerText =
					slide.directives["header"] === "empty"
						? null
						: slide.directives["header"];
			if ("header-image" in slide.directives)
				headerImage =
					slide.directives["header-image"] === "empty"
						? null
						: slide.directives["header-image"];
			if ("top-left-icon" in slide.directives)
				topLeftIcon =
					slide.directives["top-left-icon"] === "empty"
						? null
						: slide.directives["top-left-icon"];
			if ("top-right-icon" in slide.directives)
				topRightIcon =
					slide.directives["top-right-icon"] === "empty"
						? null
						: slide.directives["top-right-icon"];
		}

		let showSlideNumberOnThisSlide = slideNumbers;
		if (slides[currentSlideIndex].directives["slidenumbers"] === "false") {
			showSlideNumberOnThisSlide = false;
		}

		return {
			footerText,
			footerImageSrc: this.getImagePath(footerImage, sourcePath),
			slideNumber: showSlideNumberOnThisSlide
				? `${currentSlideIndex + 1} / ${slides.length}`
				: null,
			headerText,
			headerImageSrc: this.getImagePath(headerImage, sourcePath),
			topLeftIconSrc: this.getImagePath(topLeftIcon, sourcePath),
			topRightIconSrc: this.getImagePath(topRightIcon, sourcePath),
		};
	}

	activateSlides(leaf: WorkspaceLeaf) {
		const view = leaf.view as MarkdownView;
		const file = view.file;
		if (!file || this.previewViews.has(file.path)) return;

		const previewView = new SlidePreviewView(this.app, view.containerEl);
		previewView.create();
		this.previewViews.set(file.path, previewView);

		const update = async () => {
			const content = view.editor.getValue();
			const slides = getSlidesWithBoundaries(content);
			const cursor = view.editor.getCursor();

			const currentCache = this.app.metadataCache.getFileCache(file);
			const presoValue = currentCache?.frontmatter?.preso;

			previewView.setTheme(
				typeof presoValue === "string" ? presoValue : null,
			);

			const currentSlideIndex = slides.findIndex(
				(slide) =>
					cursor.line >= slide.startLine &&
					cursor.line <= slide.endLine,
			);

			if (currentSlideIndex === -1) {
				await previewView.update("", file.path);
				previewView.setExtras({}, "");
				return;
			}

			const currentSlide = slides[currentSlideIndex];
			const extras = this.extractSlideExtras(
				slides,
				currentSlideIndex,
				file.path,
			);

			await previewView.update(currentSlide.content, file.path);
			previewView.setExtras(extras, "");
		};

		previewView.registerDomEvent(view.contentEl, "click", update);
		update();
		previewView.show();
		previewView.registerEvent(
			this.app.workspace.on("editor-change", () => update()),
		);
	}

	deactivateSlides(leaf: WorkspaceLeaf) {
		const view = leaf?.view;
		if (view instanceof MarkdownView) {
			const file = view.file;
			if (file && this.previewViews.has(file.path)) {
				this.previewViews.get(file.path)?.destroy();
				this.previewViews.delete(file.path);
			}
		}
	}
}
