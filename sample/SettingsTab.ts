import { App, PluginSettingTab, Setting } from "obsidian";
import PrivacyPlugin from "../main";

export class PrivacySettingTab extends PluginSettingTab {
	plugin: PrivacyPlugin;

	constructor(app: App, plugin: PrivacyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Privacy Plugin Settings" });

		containerEl.createEl("h3", { text: "Transition Overlay" });

		new Setting(containerEl)
			.setName("Enable Transition Overlay")
			.setDesc(
				"Toggle to enable/disable the blurred overlay during note transitions.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableTransitionOverlay)
					.onChange(async (value) => {
						this.plugin.settings.enableTransitionOverlay = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Blur Amount")
			.setDesc(
				"Set the blur amount for the transition overlay (in pixels).",
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.transitionBlurAmount)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.transitionBlurAmount = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Transition Delay")
			.setDesc(
				"Set the delay before the overlay fades out (in milliseconds).",
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g. 300")
					.setValue(this.plugin.settings.transitionDelay.toString())
					.onChange(async (value) => {
						const delay = parseInt(value);
						if (!isNaN(delay)) {
							this.plugin.settings.transitionDelay = delay;
							await this.plugin.saveSettings();
						}
					}),
			);

		containerEl.createEl("h3", { text: "Content Redaction" });

		new Setting(containerEl)
			.setName("Default Redaction Style")
			.setDesc("Choose the default appearance for redacted content.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("Solid Block", "Solid Block")
					.addOption("Blur", "Blur")
					.setValue(this.plugin.settings.redactionStyle)
					.onChange(async (value: "Solid Block" | "Blur") => {
						this.plugin.settings.redactionStyle = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", { text: "Automatic Full-Note Privacy" });

		new Setting(containerEl)
			.setName("Enable Full Note Privacy")
			.setDesc(
				"Toggle to enable/disable automatic full-note content redaction.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableFullNotePrivacy)
					.onChange(async (value) => {
						this.plugin.settings.enableFullNotePrivacy = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Private Tag")
			.setDesc(
				"Tag to mark notes as private (e.g., 'private'). Do not include the '#'.",
			)
			.addText((text) =>
				text
					.setPlaceholder("private")
					.setValue(this.plugin.settings.privateTags)
					.onChange(async (value) => {
						this.plugin.settings.privateTags = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Private Frontmatter Key")
			.setDesc(
				"Frontmatter key to mark notes as private (e.g., 'private: true').",
			)
			.addText((text) =>
				text
					.setPlaceholder("private")
					.setValue(this.plugin.settings.privateFrontmatterKey)
					.onChange(async (value) => {
						this.plugin.settings.privateFrontmatterKey = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Private Folders")
			.setDesc(
				"A comma-separated list of folder paths. Notes in these folders will be private.",
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g. journal/,personal/")
					.setValue(this.plugin.settings.privateFolders)
					.onChange(async (value) => {
						this.plugin.settings.privateFolders = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
