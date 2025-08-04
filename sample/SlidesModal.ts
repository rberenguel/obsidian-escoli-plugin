// SlidesModal.ts

import { App, Modal, TFile } from "obsidian";
import { Slide } from "./Parser";
import { SlidePreviewView } from "./SlidePreviewView";

export class SlidesModal extends Modal {
	private slides: Slide[];
	private sourcePath: string;
	private theme: string | null;
	private slideViews: SlidePreviewView[] = [];

	constructor(
		app: App,
		slides: Slide[],
		sourcePath: string,
		theme: string | null,
	) {
		super(app);
		this.slides = slides;
		this.sourcePath = sourcePath;
		this.theme = theme;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("slides-modal");

		let footerText: string | null = null;
		let footerImage: string | null = null;
		let slideNumbers = false;
		let headerText: string | null = null;
		let headerImage: string | null = null;
		let topLeftIcon: string | null = null;
		let topRightIcon: string | null = null;

		for (const [index, slide] of this.slides.entries()) {
			if ("footer" in slide.directives) {
				footerText =
					slide.directives["footer"] === "empty"
						? null
						: slide.directives["footer"];
			}
			if ("footer-image" in slide.directives) {
				footerImage =
					slide.directives["footer-image"] === "empty"
						? null
						: slide.directives["footer-image"];
			}
			if ("slidenumbers" in slide.directives) {
				slideNumbers = slide.directives["slidenumbers"] === "true";
			}
			if ("header" in slide.directives) {
				headerText =
					slide.directives["header"] === "empty"
						? null
						: slide.directives["header"];
			}
			if ("header-image" in slide.directives) {
				headerImage =
					slide.directives["header-image"] === "empty"
						? null
						: slide.directives["header-image"];
			}
			if ("top-left-icon" in slide.directives) {
				topLeftIcon =
					slide.directives["top-left-icon"] === "empty"
						? null
						: slide.directives["top-left-icon"];
			}
			if ("top-right-icon" in slide.directives) {
				topRightIcon =
					slide.directives["top-right-icon"] === "empty"
						? null
						: slide.directives["top-right-icon"];
			}

			let showSlideNumberOnThisSlide = slideNumbers;
			if (slide.directives["slidenumbers"] === "false") {
				showSlideNumberOnThisSlide = false;
			}

			const getImagePath = (
				directiveValue: string | null,
			): string | null => {
				if (!directiveValue) return null;
				const imageMatch = directiveValue.match(/!\[\[(.*?)\]\]/);
				if (imageMatch) {
					const imageName = imageMatch[1];
					const imageFile =
						this.app.metadataCache.getFirstLinkpathDest(
							imageName,
							this.sourcePath,
						);
					if (imageFile instanceof TFile) {
						return this.app.vault.getResourcePath(imageFile);
					}
				}
				return null;
			};

			const extras = {
				footerText: footerText,
				footerImageSrc: getImagePath(footerImage),
				slideNumber: showSlideNumberOnThisSlide
					? `${index + 1} / ${this.slides.length}`
					: null,
				headerText: headerText,
				headerImageSrc: getImagePath(headerImage),
				topLeftIconSrc: getImagePath(topLeftIcon),
				topRightIconSrc: getImagePath(topRightIcon),
			};

			const slideContainer = contentEl.createEl("div", {
				cls: "slide-container",
			});
			const slideView = new SlidePreviewView(this.app, slideContainer);
			this.slideViews.push(slideView);

			slideView.create();
			slideView.setTheme(this.theme);
			await slideView.update(slide.content, this.sourcePath);
			await slideView.setExtras(extras, this.sourcePath);
			slideView.show();
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.slideViews.forEach((view) => view.destroy());
	}
}
