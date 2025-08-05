import { setIcon } from "obsidian";
import PrivacyPlugin from "../main";

export class RedactionSliderComponent {
	private containerEl: HTMLElement;
	private contentEl: HTMLElement;
	private overlayEl: HTMLElement;
	private isRevealed: boolean = false;
	private isDragging: boolean = false;
	private startX: number = 0;
	private currentX: number = 0;
	private revealThreshold: number = 50;
	private plugin: PrivacyPlugin;
	private blockId: string | null;

	constructor(
		containerEl: HTMLElement,
		redactionStyle: "Solid Block" | "Blur",
		plugin: PrivacyPlugin,
		blockId: string | null,
	) {
		this.plugin = plugin;
		this.blockId = blockId;
		this.containerEl = containerEl;
		this.containerEl.classList.add("privacy-plugin-layout-shell");

		const positionWrapper = this.containerEl.createDiv({
			cls: "privacy-plugin-position-wrapper",
		});

		this.overlayEl = positionWrapper.createDiv({
			cls: "privacy-plugin-redaction-overlay",
		});
		this.contentEl = positionWrapper.createDiv({
			cls: "privacy-plugin-redaction-content",
		});

		const childrenToMove = Array.from(this.containerEl.childNodes).filter(
			(node) => node !== positionWrapper,
		);
		childrenToMove.forEach((node) => this.contentEl.appendChild(node));

		if (redactionStyle === "Blur") {
			positionWrapper.classList.add("privacy-plugin-blur-style");
		}

		// --- FIX 1: Use setIcon() to reliably create the icon ---
		this.overlayEl.empty();
		const iconEl = this.overlayEl.createSpan({
			cls: "privacy-plugin-icon",
		});
		setIcon(iconEl, "eye-off");
		this.overlayEl.createSpan({ text: " Slide to reveal" });
		// --- END OF FIX 1 ---

		this.overlayEl.addEventListener(
			"mousedown",
			this.onMouseDown.bind(this),
		);
		this.overlayEl.addEventListener(
			"touchstart",
			this.onMouseDown.bind(this),
		);

		this.updateVisibility();
	}

	private onMouseDown(e: MouseEvent | TouchEvent) {
		if (this.isRevealed) return;
		e.stopPropagation();
		e.preventDefault();
		this.isDragging = true;
		this.overlayEl.classList.add("is-dragging");

		this.startX =
			e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
		this.currentX = this.startX;

		document.addEventListener("mousemove", this.onMouseMove.bind(this));
		document.addEventListener("mouseup", this.onMouseUp.bind(this));
		document.addEventListener("touchmove", this.onMouseMove.bind(this));
		document.addEventListener("touchend", this.onMouseUp.bind(this));
	}

	private onMouseMove(e: MouseEvent | TouchEvent) {
		if (!this.isDragging || this.isRevealed) return;

		this.currentX =
			e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
		const deltaX = this.currentX - this.startX;

		if (deltaX > 0) {
			this.overlayEl.style.transform = `translateX(${deltaX}px)`;
			this.overlayEl.style.opacity = `${1 - deltaX / this.overlayEl.offsetWidth}`;
		}
	}

	private onMouseUp(e: MouseEvent | TouchEvent) {
		if (!this.isDragging || this.isRevealed) return;

		this.isDragging = false;
		this.overlayEl.classList.remove("is-dragging");

		const deltaX = this.currentX - this.startX;

		if (deltaX > this.revealThreshold) {
			if (this.blockId) {
				this.plugin.revealedBlockIds.add(this.blockId);
			}
			this.isRevealed = true;
			this.overlayEl.style.transform = `translateX(100%)`;
			this.overlayEl.style.opacity = "0";

			setTimeout(() => {
				console.log(this.isRevealed);
				if (!this.isRevealed) return; // Check if state changed back before firing

				if (this.contentEl.childNodes.length === 0) {
					this.containerEl.remove();
					return;
				}
				this.updateVisibility();
			}, 300);
		} else {
			this.overlayEl.style.transform = `translateX(0)`;
			this.overlayEl.style.opacity = "1";
		}

		document.removeEventListener("mousemove", this.onMouseMove.bind(this));
		document.removeEventListener("mouseup", this.onMouseUp.bind(this));
		document.removeEventListener("touchmove", this.onMouseMove.bind(this));
		document.removeEventListener("touchend", this.onMouseUp.bind(this));
	}

	private updateVisibility() {
		if (this.isRevealed) {
			this.overlayEl.style.display = "none";
			this.contentEl.style.display = "block";
			// No need to reset transform/opacity here, as the element is hidden
		} else {
			this.overlayEl.style.display = "flex";
			this.contentEl.style.display = "none";
		}
	}
}
