// Exporter.ts

import {
	App,
	Notice,
	MarkdownView,
	TFile,
	Component,
	MarkdownRenderer,
	Plugin,
} from "obsidian";
import { SlidePreviewView } from "./SlidePreviewView";
import { getSlidesWithBoundaries, Slide } from "./Parser";

export class Exporter {
	private app: App;
	private plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}

	private async getAssetContent(assetName: string): Promise<string> {
		const adapter = this.app.vault.adapter;
		const path = `${this.plugin.manifest.dir}/assets/${assetName}`;
		if (await adapter.exists(path)) {
			return await adapter.read(path);
		}
		new Notice(`Could not find asset: ${assetName}`);
		return "";
	}

	public async exportPresentationAsHtml(cssOnly: boolean = false) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) {
			new Notice("No active presentation file to export.");
			return;
		}

		const file = activeView.file;
		const content = await this.app.vault.read(file);
		const allSlides = getSlidesWithBoundaries(content);
		const fileCache = this.app.metadataCache.getFileCache(file);
		const themeValue = fileCache?.frontmatter?.preso;
		const theme = typeof themeValue === "string" ? themeValue : null;

		const bodyThemeClass = document.body.className.includes("theme-dark")
			? "theme-dark"
			: "theme-light";

		new Notice(`Exporting ${allSlides.length} slides...`);

		let faviconDataUrl: string | null = null;
		const getImagePath = (directiveValue: string | null): string | null => {
			if (!directiveValue) return null;
			const imageMatch = directiveValue.match(/!\[\[(.*?)\]\]/);
			if (imageMatch) {
				const imageName = imageMatch[1];
				const imageFile = this.app.metadataCache.getFirstLinkpathDest(
					imageName,
					file.path,
				);
				if (imageFile instanceof TFile) {
					return this.app.vault.getResourcePath(imageFile);
				}
			}
			return null;
		};

		for (const slide of allSlides) {
			if ("favicon" in slide.directives) {
				const faviconPath = getImagePath(slide.directives["favicon"]);
				if (faviconPath) {
					faviconDataUrl = await this.convertUrlToBase64(faviconPath);
					break; // Use the first one found
				}
			}
		}

		let footerText: string | null = null;
		let footerImage: string | null = null;
		let slideNumbers = false;
		let headerText: string | null = null;
		let headerImage: string | null = null;
		let topLeftIcon: string | null = null;
		let topRightIcon: string | null = null;

		const slidePromises = allSlides.map(async (currentSlide, index) => {
			if ("footer" in currentSlide.directives) {
				footerText =
					currentSlide.directives["footer"] === "empty"
						? null
						: currentSlide.directives["footer"];
			}
			if ("footer-image" in currentSlide.directives) {
				footerImage =
					currentSlide.directives["footer-image"] === "empty"
						? null
						: currentSlide.directives["footer-image"];
			}
			if ("slidenumbers" in currentSlide.directives) {
				slideNumbers =
					currentSlide.directives["slidenumbers"] === "true";
			}
			if ("header" in currentSlide.directives) {
				headerText =
					currentSlide.directives["header"] === "empty"
						? null
						: currentSlide.directives["header"];
			}
			if ("header-image" in currentSlide.directives) {
				headerImage =
					currentSlide.directives["header-image"] === "empty"
						? null
						: currentSlide.directives["header-image"];
			}
			if ("top-left-icon" in currentSlide.directives) {
				topLeftIcon =
					currentSlide.directives["top-left-icon"] === "empty"
						? null
						: currentSlide.directives["top-left-icon"];
			}
			if ("top-right-icon" in currentSlide.directives) {
				topRightIcon =
					currentSlide.directives["top-right-icon"] === "empty"
						? null
						: currentSlide.directives["top-right-icon"];
			}

			let showSlideNumberOnThisSlide = slideNumbers;
			if (currentSlide.directives["slidenumbers"] === "false") {
				showSlideNumberOnThisSlide = false;
			}

			const extras = {
				footerText: footerText,
				footerImageSrc: getImagePath(footerImage),
				slideNumber: showSlideNumberOnThisSlide
					? `${index + 1} / ${allSlides.length}`
					: null,
				headerText: headerText,
				headerImageSrc: getImagePath(headerImage),
				topLeftIconSrc: getImagePath(topLeftIcon),
				topRightIconSrc: getImagePath(topRightIcon),
			};

			const speakerNotesMarkdown = currentSlide.speakerNotes.join("\n");

			const [slideHtml, speakerNotesHtml] = await Promise.all([
				this.renderSlideToHtml(
					currentSlide.content,
					file.path,
					theme,
					extras,
				),
				this.renderMarkdownToHtml(speakerNotesMarkdown, file.path),
			]);

			return { slideHtml, speakerNotesHtml };
		});

		const [combinedCss, renderedSlides] = await Promise.all([
			this.getCombinedCss(),
			Promise.all(slidePromises),
		]);

		const slidesHtml = renderedSlides.map((s) => s.slideHtml);
		const speakerNotesHtml = renderedSlides.map((s) => s.speakerNotesHtml);

		const finalHtml = cssOnly
			? await this.createCssOnlyHtmlDocument(
					file.basename,
					allSlides,
					slidesHtml,
					speakerNotesHtml,
					combinedCss,
					bodyThemeClass,
					faviconDataUrl,
				)
			: await this.createHtmlDocument(
					file.basename,
					allSlides,
					slidesHtml,
					speakerNotesHtml,
					combinedCss,
					bodyThemeClass,
					faviconDataUrl,
				);

		const suffix = cssOnly ? ".css-only.html" : ".html";
		this.downloadFile(finalHtml, `${file.basename}${suffix}`);
	}

	private async getCombinedCss(): Promise<string> {
		const styleEls = Array.from(
			document.querySelectorAll('style, link[rel="stylesheet"]'),
		);
		const cssPromises = styleEls.map(async (el) => {
			try {
				if (el.tagName.toLowerCase() === "style") {
					return el.innerHTML;
				}
				if (
					el.tagName.toLowerCase() === "link" &&
					(el as HTMLLinkElement).rel === "stylesheet"
				) {
					const href = (el as HTMLLinkElement).href;
					if (!href) return "";
					const response = await fetch(href);
					return response.ok ? await response.text() : "";
				}
			} catch (e) {
				console.warn(`Could not read or fetch stylesheet:`, el, e);
			}
			return "";
		});
		const cssStrings = await Promise.all(cssPromises);
		return cssStrings.join("\n");
	}

	private async renderMarkdownToHtml(
		markdownContent: string,
		sourcePath: string,
	): Promise<string> {
		if (!markdownContent) return "";
		const tempContainer = createDiv();
		const component = new Component();
		try {
			await MarkdownRenderer.render(
				this.app,
				markdownContent,
				tempContainer,
				sourcePath,
				component,
			);
			const allImages = Array.from(tempContainer.querySelectorAll("img"));
			for (const img of allImages) {
				if (img.src.startsWith("app://")) {
					img.src = await this.convertUrlToBase64(img.src);
				}
			}
			return tempContainer.innerHTML;
		} finally {
			component.unload();
		}
	}

	private async renderSlideToHtml(
		markdownContent: string,
		sourcePath: string,
		theme: string | null,
		extras: {
			footerText?: string | null;
			footerImageSrc?: string | null;
			slideNumber?: string | null;
			headerText?: string | null;
			headerImageSrc?: string | null;
			topLeftIconSrc?: string | null;
			topRightIconSrc?: string | null;
		},
	): Promise<string> {
		const tempContainer = createDiv();
		const tempSlide = new SlidePreviewView(this.app, tempContainer);
		tempSlide.create();
		tempSlide.setTheme(theme);

		await tempSlide.update(markdownContent, sourcePath);
		await tempSlide.setExtras(extras, sourcePath);

		const floatingEl = tempContainer.firstElementChild as HTMLElement;
		if (floatingEl) {
			const allImages = Array.from(floatingEl.querySelectorAll("img"));
			for (const img of allImages) {
				if (img.src.startsWith("app://")) {
					img.src = await this.convertUrlToBase64(img.src);
				}
			}

			const elementsWithBg = [
				floatingEl,
				...Array.from(
					floatingEl.querySelectorAll(".split-image-pane, .bg-slice"),
				),
			];
			for (const el of elementsWithBg) {
				const htmlEl = el as HTMLElement;
				if (htmlEl.style.backgroundImage.includes("app://")) {
					const urlMatch = htmlEl.style.backgroundImage.match(
						/url\("?(app:\/\/.*?)"?\)/,
					);
					if (urlMatch && urlMatch[1]) {
						const dataUrl = await this.convertUrlToBase64(
							urlMatch[1],
						);
						htmlEl.style.backgroundImage = `url("${dataUrl}")`;
					}
				}
			}
			return floatingEl.outerHTML;
		}
		return "";
	}

	private async createCssOnlyHtmlDocument(
		title: string,
		allSlides: Slide[],
		slidesHtml: string[],
		speakerNotesHtml: string[],
		css: string,
		bodyAndThemeClasses: string,
		faviconDataUrl: string | null,
	): Promise<string> {
		const numSlides = allSlides.length;
		const bodyClass = bodyAndThemeClasses.includes("theme-dark")
			? "theme-dark"
			: "theme-light";

		const radioInputs = allSlides
			.map(
				(_, index) =>
					`<input type="radio" name="slide" id="s${index + 1}" ${index === 0 ? "checked" : ""}>`,
			)
			.join("\n");

		const slideMarkup = slidesHtml
			.map((slideOuterHtml, index) => {
				if (!slideOuterHtml) return "";
				const i = index + 1;
				const prev = i === 1 ? numSlides : i - 1;
				const next = i === numSlides ? 1 : i + 1;
				const prevLabel = `<label for="s${prev}" class="nav-label prev"></label>`;
				const notesLabel = `<label for="notes-toggle" class="nav-label notes-toggle"></label>`;
				const overviewLabel = `<label for="overview-toggle" class="nav-label overview-toggle"></label>`;
				const nextLabel = `<label for="s${next}" class="nav-label next"></label>`;
				const navigationDiv = `<div class="navigation">${prevLabel}${overviewLabel}${notesLabel}${nextLabel}</div>`;
				const slideWithNav = slideOuterHtml.replace(
					/<\/div>$/,
					`${navigationDiv}<\/div>`,
				);
				return `<div class="slide-wrapper">${slideWithNav.replace('class="', 'class="is-visible ')}<\/div>`;
			})
			.join("\n");

		const speakerNotesMarkup = speakerNotesHtml
			.map(
				(notes, index) =>
					`<div class="notes-content" id="notes-for-s${index + 1}">${notes}<\/div>`,
			)
			.join("\n");

		const miniSlidesMarkup = allSlides
			.map((slide, index) => {
				return `<label for="s${index + 1}" class="mini-slide-wrapper"><div class="mini-slide-content">${slide.previewText}<\/div><\/label>`;
			})
			.join("\n");

		let dynamicCss = "";
		let dynamicNotesCss = "";
		for (let i = 1; i <= numSlides; i++) {
			dynamicCss += `#s${i}:checked ~ .slides-container .slide-wrapper:nth-of-type(${i}) { opacity: 1; pointer-events: auto; z-index: 1; }\n`;
			dynamicNotesCss += `#s${i}:checked ~ .speaker-notes-pane .notes-content-wrapper #notes-for-s${i} { display: block; }\n`;
		}

		const [template, presentationCssCommon, presentationCss] =
			await Promise.all([
				this.getAssetContent("template-css-only.html"),
				this.getAssetContent("presentation-common.css"),
				this.getAssetContent("presentation-css-only.css"),
			]);

		const finalCss = [
			css,
			presentationCssCommon,
			presentationCss
				.replace("%%DYNAMIC_CSS%%", dynamicCss)
				.replace("%%DYNAMIC_NOTES_CSS%%", dynamicNotesCss),
		].join("\n");

		const faviconTag = faviconDataUrl
			? `<link rel="icon" href="${faviconDataUrl}">`
			: "";

		return template
			.replace("%%TITLE%%", title)
			.replace("%%FAVICON_TAG%%", faviconTag)
			.replace("%%CSS%%", finalCss)
			.replace("%%BODY_CLASS%%", bodyClass)
			.replace("%%RADIO_INPUTS%%", radioInputs)
			.replace("%%MINI_SLIDES_MARKUP%%", miniSlidesMarkup)
			.replace("%%SLIDES_MARKUP%%", slideMarkup)
			.replace("%%SPEAKER_NOTES_MARKUP%%", speakerNotesMarkup);
	}

	private async createHtmlDocument(
		title: string,
		allSlides: Slide[],
		slidesHtml: string[],
		speakerNotesHtml: string[],
		css: string,
		bodyAndThemeClasses: string,
		faviconDataUrl: string | null,
	): Promise<string> {
		const bodyClass = bodyAndThemeClasses.includes("theme-dark")
			? "theme-dark"
			: "theme-light";

		const slideMarkup = slidesHtml
			.map((slideOuterHtml, index) => {
				if (!slideOuterHtml) return "";
				const prevLabel = `<div class="nav-label prev"><\/div>`;
				const notesLabel = `<div class="nav-label notes-toggle"><\/div>`;
				const overviewLabel = `<div class="nav-label overview-toggle"><\/div>`;
				const nextLabel = `<div class="nav-label next"><\/div>`;
				const navigationDiv = `<div class="navigation">${prevLabel}${overviewLabel}${notesLabel}${nextLabel}<\/div>`;
				const slideWithNav = slideOuterHtml.replace(
					/<\/div>$/,
					`${navigationDiv}<\/div>`,
				);

				return `<div class="slide-wrapper ${index === 0 ? "active" : ""}">${slideWithNav.replace('class="', 'class="is-visible ')}<\/div>`;
			})
			.join("\n");

		const speakerNotesMarkup = speakerNotesHtml
			.map(
				(notes, index) =>
					`<div class="notes-content" id="notes-for-slide-${index}">${notes}<\/div>`,
			)
			.join("\n");

		const miniSlidesMarkup = allSlides
			.map((slide, index) => {
				return `<div class="mini-slide-wrapper" data-slide-index="${index}"><div class="mini-slide-content">${slide.previewText}<\/div><\/div>`;
			})
			.join("\n");

		const [template, presentationCssCommon, presentationCss, navigationJs] =
			await Promise.all([
				this.getAssetContent("template-js.html"),
				this.getAssetContent("presentation-common.css"),
				this.getAssetContent("presentation-js.css"),
				this.getAssetContent("presentation.js"),
			]);

		const finalCss = [css, presentationCssCommon, presentationCss].join(
			"\n",
		);
		const faviconTag = faviconDataUrl
			? `<link rel="icon" href="${faviconDataUrl}">`
			: "";

		return template
			.replace("%%TITLE%%", title)
			.replace("%%FAVICON_TAG%%", faviconTag)
			.replace("%%CSS%%", finalCss)
			.replace("%%BODY_CLASS%%", bodyClass)
			.replace("%%MINI_SLIDES_MARKUP%%", miniSlidesMarkup)
			.replace("%%SLIDES_MARKUP%%", slideMarkup)
			.replace("%%SPEAKER_NOTES_MARKUP%%", speakerNotesMarkup)
			.replace("%%NAVIGATION_JS%%", navigationJs);
	}

	private async convertUrlToBase64(url: string): Promise<string> {
		const response = await fetch(url);
		const blob = await response.blob();
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	private downloadFile(content: string, filename: string) {
		const blob = new Blob([content], { type: "text/html;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
		new Notice(`Exported to ${filename}`);
	}
}
