import { App, PluginSettingTab, Setting } from "obsidian";
import EscoliPlugin from "../main";

export class EscoliSettingTab extends PluginSettingTab {
	plugin: EscoliPlugin;

	constructor(app: App, plugin: EscoliPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Escoli Settings" });

		new Setting(containerEl)
			.setName("Footnote prefix")
			.setDesc(
				"Only footnotes starting with this prefix will be converted to marginalia. (e.g., 'esc-')",
			)
			.addText((text) =>
				text
					.setPlaceholder("esc-")
					.setValue(this.plugin.settings.prefix)
					.onChange(async (value) => {
						this.plugin.settings.prefix = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
