// Parser.ts

export interface Slide {
	content: string;
	speakerNotes: string[];
	directives: Record<string, string>;
	startLine: number;
	endLine: number;
	previewText: string;
}

export function getSlidesWithBoundaries(rawContent: string): Slide[] {
	const slides: Slide[] = [];
	const lines = rawContent.split("\n");
	let slideStartIndex = 0;

	// Check for and skip YAML frontmatter
	if (lines[0]?.trim() === "---") {
		const frontmatterEndIndex = lines.slice(1).indexOf("---");
		if (frontmatterEndIndex !== -1) {
			slideStartIndex = frontmatterEndIndex + 2;
		}
	}

	let currentSlideLines: string[] = [];
	let startLine = slideStartIndex;

	const processSlide = (slideContent: string, start: number, end: number) => {
		const slideLines = slideContent.split("\n");
		const directives: Record<string, string> = {};
		let contentStartIndex = 0;

		const directiveRegex = /^\s*([a-zA-Z0-9_-]+):\s*(.*)\s*$/;

		for (let i = 0; i < slideLines.length; i++) {
			const line = slideLines[i];
			const match = line.match(directiveRegex);
			if (match) {
				const key = match[1].toLowerCase();
				const value = match[2].trim();
				directives[key] = value;
				contentStartIndex = i + 1;
			} else {
				// Stop at the first non-directive line
				break;
			}
		}

		const speakerNotes: string[] = [];
		const contentLines: string[] = [];
		const remainingLines = slideLines.slice(contentStartIndex);

		for (const line of remainingLines) {
			if (line.startsWith("^")) {
				// If it's a speaker note, add it to the list (stripping the ^)
				speakerNotes.push(line.trim().substring(1).trim());
			} else {
				// Otherwise, it's normal content
				contentLines.push(line);
			}
		}

		const content = contentLines.join("\n");
		let previewText = "...";
		for (const line of contentLines) {
			const trimmedLine = line.trim();
			if (trimmedLine && !trimmedLine.startsWith("![")) {
				let cleanedLine = trimmedLine
					.replace(/^#+\s*/g, "")
					.replace(/^[\*\-\+]\s*/g, "")
					.replace(/^\d+\.\s*/g, "")
					.replace(/_/g, "")
					.replace(/\*/g, "")
					.replace(/`/g, "")
					.trim();

				if (cleanedLine) {
					previewText =
						cleanedLine.length > 60
							? cleanedLine.substring(0, 60) + "..."
							: cleanedLine;
					break;
				}
			}
		}
		slides.push({
			content: content,
			speakerNotes: speakerNotes,
			directives: directives,
			startLine: start,
			endLine: end,
			previewText: previewText,
		});
	};

	for (let i = slideStartIndex; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "---") {
			processSlide(currentSlideLines.join("\n"), startLine, i - 1);
			startLine = i + 1;
			currentSlideLines = [];
		} else {
			currentSlideLines.push(line);
		}
	}

	processSlide(currentSlideLines.join("\n"), startLine, lines.length - 1);

	return slides.filter(
		(s) => s.content.trim() !== "" || Object.keys(s.directives).length > 0,
	);
}
