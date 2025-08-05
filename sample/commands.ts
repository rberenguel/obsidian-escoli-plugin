import { Editor, MarkdownView, Notice } from "obsidian";
import PrivacyPlugin from "../main";

export function addPrivacyCommands(plugin: PrivacyPlugin) {
	plugin.addCommand({
		id: "reset-revealed-blocks",
		name: "Privacy: Re-hide all revealed blocks ",
		callback: () => {
			plugin.revealedBlockIds.clear();
			plugin.app.workspace.updateOptions();
			new Notice("All revealed blocks have been re-hidden.");
		},
	});
	plugin.addCommand({
		id: "mark-block-as-private",
		name: "Privacy: Mark block as private",
		editorCallback: (editor: Editor, view: MarkdownView) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);

			const blockId = `^${Date.now().toString(36)}`;

			editor.setLine(cursor.line, `${line} ${blockId}`);

			const file = view.file;
			if (!file) {
				new Notice("No active file to mark.");
				return;
			}

			plugin.app.fileManager.processFrontMatter(
				file,
				(frontmatter: any) => {
					if (!frontmatter.privacy) {
						frontmatter.privacy = [];
					}
					if (!Array.isArray(frontmatter.privacy)) {
						new Notice(
							"Frontmatter 'privacy' key is not a list. Please fix it manually.",
						);
						return;
					}
					// Add only the ID part (without ^) to the frontmatter
					frontmatter.privacy.push(blockId.substring(1));
				},
			);

			new Notice(`Block marked with ID: ${blockId}`);
		},
	});

	plugin.addCommand({
		id: "unmark-block-as-private",
		name: "Privacy: Unmark block as private",
		editorCallback: (editor: Editor, view: MarkdownView) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);

			// Regex to find a block ID at the end of the line
			const blockIdMatch = line.match(/\s(\^[a-zA-Z0-9]+)$/);

			if (!blockIdMatch) {
				new Notice("No block ID found on the current line.");
				return;
			}

			const blockId = blockIdMatch[1];
			const newLine = line.replace(blockIdMatch[0], ""); // Remove the block ID from the line
			editor.setLine(cursor.line, newLine);

			// Get the current file and its frontmatter
			const file = view.file;
			if (!file) {
				new Notice("No active file to unmark.");
				return;
			}

			plugin.app.fileManager.processFrontMatter(
				file,
				(frontmatter: any) => {
					if (Array.isArray(frontmatter.privacy)) {
						// Remove the ID part (without ^) from the frontmatter
						frontmatter.privacy = frontmatter.privacy.filter(
							(id: string) => id !== blockId.substring(1),
						);
					}
				},
			);

			new Notice(`Block unmarked: ${blockId}`);
		},
	});
}
