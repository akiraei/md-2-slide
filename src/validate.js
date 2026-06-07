const ALLOWED_MERMAID_TYPES = new Set(["flowchart", "kanban", "timeline", "sequenceDiagram"]);

export function validateSlides(slides) {
  const errors = [];
  const warnings = [];

  if (slides.length === 0) {
    errors.push({ slideNumber: 0, message: "No slides found." });
  }

  for (const slide of slides) {
    if (!slide.screenTitle) {
      warnings.push({ slideNumber: slide.number, message: "Missing '화면 제목' section." });
    }
    if (!slide.content && slide.mermaidBlocks.length === 0) {
      warnings.push({ slideNumber: slide.number, message: "No visible content or Mermaid diagram found." });
    }

    for (const block of slide.mermaidBlocks) {
      if (!ALLOWED_MERMAID_TYPES.has(block.type)) {
        errors.push({
          slideNumber: slide.number,
          message: `Unsupported Mermaid type '${block.type}'. Allowed: ${Array.from(ALLOWED_MERMAID_TYPES).join(", ")}.`,
        });
      }
    }

    if (slide.mermaidBlocks.length > 1) {
      warnings.push({ slideNumber: slide.number, message: "Multiple Mermaid diagrams on one slide may reduce readability." });
    }
  }

  return { errors, warnings };
}
