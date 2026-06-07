import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pptxgen from "pptxgenjs";
import { parseMarkdown } from "./parser.js";
import { renderMermaidBlocks } from "./mermaid.js";
import { validateSlides } from "./validate.js";

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const COLORS = {
  ink: "172033",
  text: "334155",
  muted: "64748B",
  line: "D9E2EF",
  wash: "F8FAFC",
  blue: "2563EB",
  teal: "0F766E",
  violet: "7C3AED",
  amber: "B45309",
};
const TEXT_FLOW = {
  breakLine: false,
  fit: "shrink",
  paraSpaceAfterPt: 17,
  lineSpacingMultiple: 1.24,
};

export async function buildDeck(inputPath, outputPath, options = {}) {
  const slides = await parseMarkdown(inputPath);
  const validation = validateSlides(slides);
  const deckPath = path.resolve(outputPath);
  const notesPath = deckPath.replace(/\.pptx$/i, "") + ".notes.md";

  if (validation.errors.length > 0) {
    return { validation, deckPath, notesPath };
  }

  await mkdir(path.dirname(deckPath), { recursive: true });
  const mermaidRender = await renderMermaidBlocks(slides, { keepArtifacts: options.keepArtifacts });

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "md-slide";
  pptx.subject = "Generated from structured Markdown";
  pptx.title = path.basename(inputPath);
  pptx.company = "md-slide";
  pptx.lang = "ko-KR";
  pptx.theme = {
    headFontFace: "Apple SD Gothic Neo",
    bodyFontFace: "Apple SD Gothic Neo",
    lang: "ko-KR",
  };

  for (const slideData of slides) {
    addSlide(pptx, slideData);
  }

  try {
    await pptx.writeFile({ fileName: deckPath });
    await writeFile(notesPath, buildNotes(slides), "utf8");
  } finally {
    await mermaidRender.cleanup();
  }

  return { validation, deckPath, notesPath };
}

function addSlide(pptx, slideData) {
  const slide = pptx.addSlide();
  slide.background = { color: "FBFCFE" };

  const hasDiagram = slideData.renderedMermaid?.length > 0;
  const title = slideData.screenTitle || slideData.slideTitle;
  const kind = classifySlide(slideData);

  addChrome(slide, slideData, kind);

  slide.addText(title, {
    x: 0.72,
    y: 0.42,
    w: 11.85,
    h: 0.78,
    fontFace: "Apple SD Gothic Neo",
    fontSize: fitFont(title, kind === "statement" ? 34 : 29, 21),
    bold: true,
    color: COLORS.ink,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    align: "left",
  });

  if (hasDiagram) {
    addContentWithDiagram(slide, slideData);
  } else if (kind === "cards") {
    addSectionCards(slide, slideData);
  } else if (kind === "table") {
    addTableSlide(slide, slideData);
  } else if (kind === "statement") {
    addStatementSlide(slide, slideData);
  } else {
    addContentOnly(slide, slideData);
  }

  if (slideData.speakerNotes) {
    slide.addNotes(slideData.speakerNotes);
  }
}

function addContentOnly(slide, slideData) {
  const body = normalizeVisibleText(slideData.content);
  slide.addText(body || slideData.slideTitle, {
    x: 1.02,
    y: 1.62,
    w: 11.3,
    h: 4.75,
    fontFace: "Apple SD Gothic Neo",
    fontSize: fitBodyFont(body, 27),
    color: COLORS.text,
    valign: "mid",
    align: "left",
    ...TEXT_FLOW,
  });
}

function addContentWithDiagram(slide, slideData) {
  const body = normalizeVisibleText(slideData.content);
  const hasShortBody = body.length < 115 && !body.includes("•") && !body.includes("\n");
  const diagram = slideData.renderedMermaid[0];

  if (hasShortBody) {
    slide.addText(body, {
      x: 0.78,
      y: 1.2,
      w: 11.75,
      h: 0.42,
      fontFace: "Apple SD Gothic Neo",
      fontSize: fitBodyFont(body, 17),
      color: COLORS.muted,
      margin: 0,
      align: "left",
      ...TEXT_FLOW,
    });

    addDiagramFrame(slide, diagram, 1.0, 1.82, 11.35, 4.72);
    return;
  }

  slide.addText(body, {
    x: 0.82,
    y: 1.55,
    w: 3.65,
    h: 4.85,
    fontFace: "Apple SD Gothic Neo",
    fontSize: fitBodyFont(body, 17),
    color: COLORS.text,
    align: "left",
    ...TEXT_FLOW,
  });

  addDiagramFrame(slide, diagram, 4.86, 1.48, 7.48, 4.98);
}

function addDiagramFrame(slide, diagram, x, y, w, h) {
  slide.addShape("rect", {
    x,
    y,
    w,
    h,
    fill: { color: "FFFFFF" },
    line: { color: COLORS.line, width: 1 },
    shadow: { type: "outer", color: "D8DEE9", opacity: 0.16, blur: 1, angle: 45, distance: 1 },
  });
  const box = containRect(
    { x: x + 0.18, y: y + 0.18, w: w - 0.36, h: h - 0.36 },
    diagram.widthPx || 16,
    diagram.heightPx || 9,
  );
  slide.addImage({ path: diagram.pngPath, ...box });
}

function containRect(box, imageW, imageH) {
  const imageRatio = imageW / imageH;
  const boxRatio = box.w / box.h;

  if (imageRatio > boxRatio) {
    const h = box.w / imageRatio;
    return {
      x: box.x,
      y: box.y + (box.h - h) / 2,
      w: box.w,
      h,
    };
  }

  const w = box.h * imageRatio;
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y,
    w,
    h: box.h,
  };
}

function addStatementSlide(slide, slideData) {
  const body = normalizeVisibleText(slideData.content);
  slide.addShape("rect", {
    x: 0.92,
    y: 1.72,
    w: 11.5,
    h: 4.28,
    fill: { color: "FFFFFF" },
    line: { color: COLORS.line, width: 1 },
  });
  slide.addText(body, {
    x: 1.35,
    y: 2.1,
    w: 10.65,
    h: 3.55,
    fontFace: "Apple SD Gothic Neo",
    fontSize: fitBodyFont(body, 30),
    bold: body.length < 80,
    color: COLORS.ink,
    valign: "mid",
    align: "left",
    ...TEXT_FLOW,
  });
}

function addSectionCards(slide, slideData) {
  const sections = parseContentSections(slideData.content);
  const count = Math.min(sections.length, 3);
  const gap = 0.28;
  const cardW = (11.9 - gap * (count - 1)) / count;
  const y = 1.58;
  const h = 4.88;
  const accents = [COLORS.blue, COLORS.teal, COLORS.violet];

  sections.slice(0, 3).forEach((section, index) => {
    const x = 0.72 + index * (cardW + gap);
    slide.addShape("rect", {
      x,
      y,
      w: cardW,
      h,
      fill: { color: "FFFFFF" },
      line: { color: COLORS.line, width: 1 },
    });
    slide.addShape("rect", {
      x,
      y,
      w: 0.08,
      h,
      fill: { color: accents[index] },
      line: { color: accents[index] },
    });
    slide.addText(section.title, {
      x: x + 0.28,
      y: y + 0.28,
      w: cardW - 0.5,
      h: 0.45,
      fontFace: "Apple SD Gothic Neo",
      fontSize: 18,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: "shrink",
      align: "left",
    });
    slide.addText(normalizeVisibleText(section.body), {
      x: x + 0.28,
      y: y + 0.92,
      w: cardW - 0.5,
      h: h - 1.15,
      fontFace: "Apple SD Gothic Neo",
      fontSize: fitBodyFont(section.body, 18),
      color: COLORS.text,
      align: "left",
      ...TEXT_FLOW,
    });
  });
}

function addTableSlide(slide, slideData) {
  const table = parseMarkdownTable(slideData.content);
  if (!table) {
    addContentOnly(slide, slideData);
    return;
  }

  const rows = [table.headers, ...table.rows].slice(0, 8);
  const rowH = Math.min(0.62, 4.85 / rows.length);
  const colW = 11.65 / table.headers.length;
  const x0 = 0.84;
  const y0 = 1.55;

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const x = x0 + colIndex * colW;
      const y = y0 + rowIndex * rowH;
      const header = rowIndex === 0;
      slide.addShape("rect", {
        x,
        y,
        w: colW,
        h: rowH,
        fill: { color: header ? COLORS.blue : rowIndex % 2 === 0 ? "FFFFFF" : COLORS.wash },
        line: { color: header ? COLORS.blue : COLORS.line, width: 1 },
      });
      slide.addText(cell, {
        x: x + 0.12,
        y: y + 0.12,
        w: colW - 0.24,
        h: rowH - 0.18,
        fontFace: "Apple SD Gothic Neo",
        fontSize: header ? 13 : 12,
        bold: header,
        color: header ? "FFFFFF" : COLORS.text,
        margin: 0,
        fit: "shrink",
        breakLine: false,
      });
    });
  });
}

function addChrome(slide, slideData, kind) {
  const accent = kind === "diagram" ? COLORS.teal : kind === "cards" ? COLORS.violet : COLORS.blue;
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.16,
    h: SLIDE_H,
    fill: { color: accent },
    line: { color: accent },
  });
  slide.addShape("line", {
    x: 0.72,
    y: 6.92,
    w: 11.9,
    h: 0,
    line: { color: COLORS.line, width: 1 },
  });
  slide.addText(slideData.slideTitle, {
    x: 0.72,
    y: 7.03,
    w: 10.5,
    h: 0.22,
    fontFace: "Apple SD Gothic Neo",
    fontSize: 7.5,
    color: COLORS.muted,
    margin: 0,
    breakLine: false,
  });
  slide.addText(String(slideData.number).padStart(2, "0"), {
    x: 12.1,
    y: 7.03,
    w: 0.55,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 7.5,
    color: COLORS.muted,
    align: "right",
    margin: 0,
  });
}

function normalizeVisibleText(text) {
  return convertTablesToLines(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{3,}\s+/gm, "")
    .replace(/^-\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, (match) => match)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertTablesToLines(text) {
  const lines = text.split("\n");
  const result = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith("|") && lines[index + 1]?.includes("---")) {
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      const table = parseMarkdownTable(tableLines.join("\n"));
      if (table) {
        for (const row of table.rows) {
          result.push(`• ${row.join(": ")}`);
        }
      }
      continue;
    }
    result.push(lines[index]);
  }

  return result.join("\n");
}

function fitFont(text, max, min) {
  if (text.length > 34) return Math.max(min, max - 6);
  if (text.length > 24) return Math.max(min, max - 3);
  return max;
}

function fitBodyFont(text, max) {
  const length = text.length;
  if (length > 420) return 13;
  if (length > 280) return 15;
  if (length > 160) return Math.min(max, 17);
  return max;
}

function classifySlide(slideData) {
  if (slideData.renderedMermaid?.length > 0) return "diagram";
  if (parseMarkdownTable(slideData.content)) return "table";
  if (parseContentSections(slideData.content).length >= 2) return "cards";
  if (slideData.content.length < 170 && !slideData.content.includes("- ")) return "statement";
  return "body";
}

function parseContentSections(content) {
  const lines = content.split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const match = /^###\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = { title: match[1], bodyLines: [] };
      sections.push(current);
    } else if (current) {
      current.bodyLines.push(line);
    }
  }

  return sections
    .map((section) => ({ title: section.title, body: section.bodyLines.join("\n").trim() }))
    .filter((section) => section.body.length > 0);
}

function parseMarkdownTable(content) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (tableLines.length < 3) return null;

  const headers = splitTableRow(tableLines[0]);
  const separator = splitTableRow(tableLines[1]).every((cell) => /^:?-{3,}:?$/.test(cell));
  if (!separator) return null;

  return {
    headers,
    rows: tableLines.slice(2).map(splitTableRow),
  };
}

function splitTableRow(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => normalizeVisibleText(cell.trim()));
}

function buildNotes(slides) {
  return slides
    .map((slide) => {
      const notes = slide.speakerNotes || "(발표 메모 없음)";
      return `# ${slide.slideTitle}\n\n${notes}\n`;
    })
    .join("\n---\n\n");
}
