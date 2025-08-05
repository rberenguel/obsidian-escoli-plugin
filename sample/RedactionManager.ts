// src/RedactionManager.ts

import { App, MarkdownView, FrontMatterCache, TFile } from "obsidian";
import { RedactionSliderComponent } from "./RedactionSliderComponent";
import { PrivacyPluginSettings } from "../main";
import PrivacyPlugin from "../main";

export class RedactionManager {
	private app: App;
	private settings: PrivacyPluginSettings;
	private plugin: PrivacyPlugin;

	constructor(
		app: App,
		settings: PrivacyPluginSettings,
		plugin: PrivacyPlugin,
	) {
		this.app = app;
		this.plugin = plugin;
		this.settings = settings;
	}

	public isFullNotePrivate(
		file: TFile,
		fileCache: FrontMatterCache | null,
	): boolean {
		if (!this.settings.isPrivacyModeActive) {
			return false;
		}

		if (!this.settings.enableFullNotePrivacy) {
			return false;
		}

		const privateTags = this.settings.privateTags
			.split(",")
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		const hasPrivateTag =
			fileCache?.tags?.some((t: any) =>
				privateTags.includes(t.tag.substring(1)),
			) ?? false;
		if (hasPrivateTag) return true;

		if (
			fileCache?.frontmatter?.[this.settings.privateFrontmatterKey] ===
			true
		) {
			return true;
		}

		const privateFolders = this.settings.privateFolders
			.split(",")
			.map((f) => f.trim())
			.filter((f) => f.length > 0 && f !== "/");
		const inPrivateFolder = privateFolders.some((f) =>
			file.path.startsWith(f),
		);
		if (inPrivateFolder) return true;

		return false;
	}

	private sanitizeForCss(path: string): string {
		return path.replace(/[^a-zA-Z0-9-]/g, "-");
	}

	// Replace the old method with this new, more robust version
	public applyFullNoteRedaction(view: MarkdownView) {
		const file = view.file;
		if (!file) return;

		// --- NEW LOGIC: Always clean up existing overlays first ---
		const existingOverlays = document.querySelectorAll(
			".privacy-plugin-full-note-overlay",
		);
		existingOverlays.forEach((el) => el.remove());
		// --- END OF CHANGE ---

		const isPrivate = this.isFullNotePrivate(
			file,
			this.app.metadataCache.getFileCache(file),
		);

		if (isPrivate) {
			const containerEl = view.containerEl;

			// Create an overlay div that covers the entire view.
			const overlay = containerEl.createDiv();
			// Add a static class for easy cleanup next time
			overlay.addClass("privacy-plugin-full-note-overlay");
			overlay.style.position = "absolute";
			overlay.style.top = "0";
			overlay.style.left = "0";
			overlay.style.width = "100%";
			overlay.style.height = "100%";
			overlay.style.zIndex = "50";

			new RedactionSliderComponent(
				overlay as HTMLElement,
				this.settings.redactionStyle,
				this.plugin,
				null,
			);
		}
		// No 'else' block is needed anymore, as the cleanup runs unconditionally at the start.
	}
}
