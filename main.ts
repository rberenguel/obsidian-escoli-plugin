import { Plugin } from "obsidian";
import { EscoliSettingTab } from "./src/SettingsTab";
import { buildEscoliViewPlugin } from "./src/EscoliViewPlugin";

interface EscoliPluginSettings {
	prefix: string;
}

const DEFAULT_SETTINGS: EscoliPluginSettings = {
	prefix: "esc-",
};

export default class EscoliPlugin extends Plugin {
	settings: EscoliPluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new EscoliSettingTab(this.app, this));

		// Register the ViewPlugin by passing the main plugin instance directly.
		this.registerEditorExtension(buildEscoliViewPlugin(this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}