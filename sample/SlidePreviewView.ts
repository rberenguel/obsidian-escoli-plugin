// SlidePreviewView.ts
import { App, MarkdownRenderer, Component } from "obsidian";
import interact from "interactjs";

export class SlidePreviewView {
	private app: App;
	private containerEl: HTMLElement;
	private component: Component;
	private floatingEl: HTMLElement | null;
	private visible: boolean = false;
	private currentTheme: string | null = null;
	private extrasEl: HTMLElement | null = null;

	constructor(app: App, containerEl: HTMLElement) {
		this.app = app;
		this.containerEl = containerEl;
		this.component = new Component();
		this.floatingEl = null;
	}

	create() {
		this.floatingEl = this.containerEl.createEl("div", {
			cls: "slide-preview",
		});
		const isMobile = (this.app as any).isMobile;
		const minDimensions = isMobile
			? { width: 160, height: 90 }
			: { width: 240, height: 135 };
		interact(this.floatingEl)
			.draggable({
				inertia: true,
				modifiers: [
					interact.modifiers.restrictRect({
						restriction: "parent",
						endOnly: true,
					}),
				],
				autoScroll: true,
				listeners: {
					move: (event) => {
						const target = event.target;
						const x =
							(parseFloat(target.getAttribute("data-x")) || 0) +
							event.dx;
						const y =
							(parseFloat(target.getAttribute("data-y")) || 0) +
							event.dy;
						target.style.transform = `translate(${x}px, ${y}px)`;
						target.setAttribute("data-x", x);
						target.setAttribute("data-y", y);
					},
				},
			})
			.resizable({
				edges: { left: true, right: true, bottom: true, top: true },
				modifiers: [
					interact.modifiers.restrictEdges({
						outer: "parent",
					}),
					interact.modifiers.aspectRatio({
						ratio: 16 / 9,
					}),
					interact.modifiers.restrictSize({
						min: minDimensions,
					}),
				],
				listeners: {
					move: (event) => {
						const target = event.target;
						let x = parseFloat(target.getAttribute("data-x")) || 0;
						let y = parseFloat(target.getAttribute("data-y")) || 0;

						target.style.width = `${event.rect.width}px`;
						target.style.height = `${event.rect.height}px`;
						target.style.transform = `translate(${x}px, ${y}px)`;
						target.setAttribute("data-x", x);
						target.setAttribute("data-y", y);
					},
				},
				inertia: true,
			});
	}

	setTheme(theme: string | null | undefined) {
		if (!this.floatingEl) return;
		if (this.currentTheme) {
			this.floatingEl.classList.remove(this.currentTheme);
			this.currentTheme = null;
		}
		if (theme && typeof theme === "string") {
			this.floatingEl.classList.add(theme);
			this.currentTheme = theme;
		}
	}

	private isStraightLinkTree(htmlEl: HTMLElement): boolean {
		let currentNode: HTMLElement = htmlEl;

		while (true) {
			const elementChildren = currentNode.children;

			if (elementChildren.length > 1) {
				return false;
			}

			if (elementChildren.length === 0) {
				return currentNode.tagName.toLowerCase() === "a";
			}

			currentNode = elementChildren[0] as HTMLElement;
		}
	}

	private applyInlineCssDirectives(container: HTMLElement) {
		const elements = container.querySelectorAll(
			"p, h1, h2, h3, h4, h5, h6, li",
		);
		const directiveRegex = /\{css;`?(.+?)`?\}/g;
		elements.forEach((element) => {
			const htmlEl = element as HTMLElement;
			if (htmlEl.innerHTML.includes("{css;")) {
				console.log(
					`[Preso-debug]: Directive found in '${htmlEl.innerHTML}'`,
				);
				const originalHtml = htmlEl.innerHTML;
				let styles = "";

				const cleanedHtml = originalHtml.replace(
					directiveRegex,
					(match, css_) => {
						const css = css_
							.replace("<code>", "")
							.replace("</code>", "");
						// This let's us wrap the CSS directives in a code block
						styles += css.trim().endsWith(";")
							? css.trim() + " "
							: css.trim() + "; ";
						return "";
					},
				);

				if (styles) {
					if (this.isStraightLinkTree(htmlEl)) {
						// This let's us style only links
						console.log(`[Preso-debug]: This is a pure link tree`);
						htmlEl.innerHTML = cleanedHtml.trim();
						const a = htmlEl.querySelector("A") as HTMLElement;
						if (a) {
							const tempDiv = document.createElement("div");
							tempDiv.innerHTML = cleanedHtml.trim();
							console.log(cleanedHtml.trim());
							a.style.cssText += styles;
							a.textContent = tempDiv.textContent;
						}
					} else {
						console.log(`[Preso-debug]: This is a composite tree`);
						htmlEl.style.cssText += styles;
						htmlEl.innerHTML = cleanedHtml.trim();
					}
				}
			}
		});
	}

	async update(markdownContent: string, sourcePath: string) {
		console.log("[Preso-Debug] --- Slide update triggered ---");
		if (!this.floatingEl) {
			return;
		}

		this.floatingEl.style.border = "";
		this.floatingEl.innerHTML = "";
		this.floatingEl.style.backgroundImage = "";
		this.floatingEl.classList.remove(
			"layout-fill",
			"layout-bg",
			"layout-split",
			"split-left",
			"split-right",
		);
		console.log(markdownContent);
		const hrProcessedMarkdown = markdownContent.replace(/^\/---$/gm, "---");
		console.log(hrProcessedMarkdown);
		const shadowHost = createDiv();
		let finalMarkdown = hrProcessedMarkdown;

		console.log(
			"[Preso-Debug] 1. Initial markdown content:",
			JSON.stringify(markdownContent),
		);

		const lines = hrProcessedMarkdown.split("\n");
		const footnoteDefs = new Map<string, string>();
		const contentLines: string[] = [];
		// Gemini stop fucking double escaping the following regex, it
		// is fucking correct for fuck's sake
		const footnoteDefRegex = /^.*\[(.+?)\]:\s*(.*)/;

		for (const line of lines) {
			console.log("[Preso-Debug] 1.1 Lines:", line);
			const match = line.match(footnoteDefRegex);
			if (match) {
				footnoteDefs.set(match[1].trim(), match[2].trim());
			} else {
				contentLines.push(line);
			}
		}
		console.log(
			"[Preso-Debug] 2. Parsed footnote definitions:",
			footnoteDefs,
		);

		if (footnoteDefs.size > 0) {
			const mainMarkdown = contentLines.join("\n");
			console.log(
				"[Preso-Debug] 3. Markdown content for reference parsing:",
				JSON.stringify(mainMarkdown),
			);
			// Gemini stop fucking double escaping the following regex, it
			// is fucking correct for fuck's sake
			const footnoteRefRegex = /\[\^(.+?)\]/g;
			const footnoteRefMap = new Map<string, number>();
			let footnoteCounter = 1;

			mainMarkdown.replace(footnoteRefRegex, (match, id) => {
				console.log(match, id);
				id = id.trim();
				if (footnoteDefs.has(id) && !footnoteRefMap.has(id)) {
					footnoteRefMap.set(id, footnoteCounter++);
				}
				return match;
			});
			console.log(
				"[Preso-Debug] 4. Map of found references to their order:",
				footnoteRefMap,
			);

			if (footnoteRefMap.size > 0) {
				finalMarkdown = mainMarkdown.replace(
					footnoteRefRegex,
					(match, id) => {
						id = id.trim();
						if (footnoteRefMap.has(id)) {
							const index = footnoteRefMap.get(id)!;
							return `<sup class="footnote-ref">${index}</sup>`;
						}
						return match;
					},
				);
				console.log(
					"[Preso-Debug] 5. Final markdown with <sup> tags:",
					JSON.stringify(finalMarkdown),
				);

				const footnotesContainer = this.floatingEl.createEl("div", {
					cls: "slide-footnotes-container",
				});
				const footnotesSection = footnotesContainer.createEl(
					"section",
					{
						cls: "footnotes",
					},
				);
				const footnotesList = footnotesSection.createEl("ol");
				const sortedRefs = Array.from(footnoteRefMap.entries()).sort(
					(a, b) => a[1] - b[1],
				);

				console.log("[Preso-Debug] 6. Building footnote list HTML...");
				for (const [id, index] of sortedRefs) {
					const content = footnoteDefs.get(id);
					if (content) {
						const listItem = footnotesList.createEl("li", {
							attr: { id: `fn-${id}` },
						});
						await MarkdownRenderer.render(
							this.app,
							content,
							listItem,
							sourcePath ?? "",
							this.component,
						);
					}
				}
			} else {
				finalMarkdown = mainMarkdown;
			}
		}

		await MarkdownRenderer.render(
			this.app,
			finalMarkdown,
			shadowHost,
			sourcePath,
			this.component,
		);

		this.applyInlineCssDirectives(shadowHost);

		const allImages = Array.from(shadowHost.querySelectorAll("img"));
		const isSimpleFill =
			allImages.length === 1 &&
			!allImages[0].alt.match(/^(bg|left|right)/) &&
			shadowHost.textContent?.trim() === "";
		if (isSimpleFill) {
			this.floatingEl.classList.add("layout-fill");
			this.floatingEl.style.backgroundImage = `url("${allImages[0].src}")`;
			return;
		}
		const imageInfos = allImages.map((img) => ({
			el: img,
			match: img.alt.match(/^(bg|left|right)(?:\s+(.*))?$/),
		}));
		const bgImageInfos = imageInfos.filter(
			(info) => info.match && info.match[1] === "bg",
		);
		const sideImageInfo = imageInfos.find(
			(info) => info.match && ["left", "right"].includes(info.match[1]),
		);
		if (bgImageInfos.length > 0) {
			this.floatingEl.classList.add("layout-bg");
			const sliceContainer = this.floatingEl.createEl("div", {
				cls: "bg-slice-container",
			});
			bgImageInfos.forEach((info) => {
				const slice = sliceContainer.createEl("div", {
					cls: "bg-slice",
				});
				slice.style.backgroundImage = `url("${info.el.src}")`;
				info.el.parentElement?.remove();
			});
			const bgWrapper = this.floatingEl.createEl("div", {
				cls: "bg-content-wrapper",
			});
			const filterArgs = bgImageInfos[0].match?.[2]?.trim();
			if (filterArgs) {
				bgWrapper.style.setProperty("--custom-bg-filter", filterArgs);
			} else {
				bgWrapper.style.removeProperty("--custom-bg-filter");
			}
			Array.from(shadowHost.querySelectorAll("p")).forEach((p) => {
				if (p.textContent?.trim() === "") p.remove();
			});
			bgWrapper.append(...Array.from(shadowHost.childNodes));
		} else if (sideImageInfo) {
			const keyword = sideImageInfo.match![1];
			const specialImage = sideImageInfo.el;
			specialImage.parentElement?.remove();
			this.floatingEl.classList.add(
				"layout-split",
				keyword === "left" ? "split-left" : "split-right",
			);
			const imagePane = this.floatingEl.createEl("div", {
				cls: "split-image-pane",
			});
			const textPane = this.floatingEl.createEl("div", {
				cls: "split-text-pane",
			});
			imagePane.style.backgroundImage = `url("${specialImage.src}")`;
			Array.from(shadowHost.querySelectorAll("p")).forEach((p) => {
				if (p.innerHTML.trim() === "") p.remove();
			});
			textPane.append(...Array.from(shadowHost.childNodes));
		} else {
			this.floatingEl.append(...Array.from(shadowHost.childNodes));
		}
		if (this.floatingEl) {
			this.floatingEl.style.opacity = "0.999";
			requestAnimationFrame(() => {
				if (this.floatingEl) {
					this.floatingEl.style.opacity = "1";
				}
			});
		}
	}

	// SlidePreviewView.ts

	public async setExtras(
		options: {
			footerText?: string | null;
			footerImageSrc?: string | null;
			slideNumber?: string | null;
			headerText?: string | null;
			headerImageSrc?: string | null;
			topLeftIconSrc?: string | null;
			topRightIconSrc?: string | null;
		},
		sourcePath: string,
	) {
		if (!this.floatingEl) return;

		// Remove any existing extras containers
		this.floatingEl
			.querySelector(".slide-header-extras-container")
			?.remove();
		this.floatingEl
			.querySelector(".slide-footer-extras-container")
			?.remove();

		const hasHeader =
			options.headerText ||
			options.headerImageSrc ||
			options.topLeftIconSrc ||
			options.topRightIconSrc;
		const hasFooter =
			options.footerText || options.footerImageSrc || options.slideNumber;

		// Create and populate the header container if needed
		if (hasHeader) {
			const headerContainer = this.floatingEl.createEl("div", {
				cls: "slide-header-extras-container",
			});
			const leftGroup = headerContainer.createEl("div", {
				cls: "extras-left-group",
			});
			const rightGroup = headerContainer.createEl("div", {
				cls: "extras-right-group",
			});

			if (options.topLeftIconSrc) {
				leftGroup.createEl("img", {
					attr: { src: options.topLeftIconSrc },
					cls: "top-left-icon",
				});
			}
			if (options.headerText || options.headerImageSrc) {
				const headerContent = leftGroup.createEl("div", {
					cls: "header-content",
				});
				if (options.headerImageSrc) {
					headerContent.createEl("img", {
						attr: { src: options.headerImageSrc },
						cls: "header-image",
					});
				}
				if (options.headerText) {
					const headerTextEl = headerContent.createEl("span");
					await MarkdownRenderer.render(
						this.app,
						options.headerText,
						headerTextEl,
						sourcePath ?? "",
						this.component,
					);
					this.applyInlineCssDirectives(headerTextEl);
				}
			}
			if (options.topRightIconSrc) {
				rightGroup.createEl("img", {
					attr: { src: options.topRightIconSrc },
					cls: "top-right-icon",
				});
			}
		}

		// Create and populate the footer container if needed
		if (hasFooter) {
			const footerContainer = this.floatingEl.createEl("div", {
				cls: "slide-footer-extras-container",
			});
			const leftGroup = footerContainer.createEl("div", {
				cls: "extras-left-group",
			});
			const rightGroup = footerContainer.createEl("div", {
				cls: "extras-right-group",
			});

			if (options.footerText || options.footerImageSrc) {
				const footerContent = leftGroup.createEl("div", {
					cls: "footer-content",
				});
				if (options.footerImageSrc) {
					footerContent.createEl("img", {
						attr: { src: options.footerImageSrc },
						cls: "footer-image",
					});
				}
				if (options.footerText) {
					console.log("Footing", sourcePath);
					const footerTextEl = footerContent.createEl("span");
					await MarkdownRenderer.render(
						this.app,
						options.footerText,
						footerTextEl,
						sourcePath ?? "",
						this.component,
					);
					this.applyInlineCssDirectives(footerTextEl);
				}
			}
			if (options.slideNumber) {
				rightGroup.createEl("div", {
					cls: "slide-number",
					text: options.slideNumber,
				});
			}
		}
	}

	show() {
		if (!this.floatingEl) return;
		this.floatingEl.classList.add("is-visible");
		this.visible = true;
	}

	hide() {
		if (!this.floatingEl) return;
		this.floatingEl.classList.remove("is-visible");
		this.visible = false;
	}

	toggle() {
		if (this.visible) {
			this.hide();
		} else {
			this.show();
		}
	}

	destroy() {
		if (this.floatingEl) {
			this.floatingEl.remove();
			this.floatingEl = null;
		}
		this.component.unload();
	}

	registerDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions,
	) {
		this.component.registerDomEvent(el, type, callback, options);
	}

	registerEvent(eventRef: any) {
		this.component.registerEvent(eventRef);
	}

	public getInnerHtml(): string {
		return this.floatingEl ? this.floatingEl.innerHTML : "";
	}
}
