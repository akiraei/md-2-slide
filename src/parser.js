import { readFile } from "node:fs/promises";
import path from "node:path";

const SECTION_NAMES = ["화면 제목", "화면 내용", "화면 구성", "발표 메모", "자료"];

export async function parseMarkdown(inputPath) {
  const absolutePath = path.resolve(inputPath);
  const source = await readFile(absolutePath, "utf8");
  return parseMarkdownSource(source, absolutePath);
}

export function parseMarkdownSource(source, filePath = "<memory>") {
  const normalized = source.replace(/\r\n/g, "\n");
  const chunks = splitSlides(normalized);

  return chunks
    .map((chunk, index) => parseSlide(chunk, index + 1, filePath))
    .filter((slide) => slide.raw.trim().length > 0);
}

function splitSlides(source) {
  const slideHeading = /^#\s+슬라이드\s+\d+[\s.]/gm;
  const starts = [];
  let match;

  while ((match = slideHeading.exec(source)) !== null) {
    starts.push(match.index);
  }

  if (starts.length > 0) {
    return starts
      .map((start, index) => source.slice(start, starts[index + 1] ?? source.length))
      .map((part) => part.replace(/\n---+\s*$/g, "").trim())
      .filter((part) => /^#\s+슬라이드\s+\d+[\s.]/.test(part));
  }

  return source.split(/\n---+\n/g).map((part) => part.trim()).filter(Boolean);
}

function parseSlide(raw, number, filePath) {
  const lines = raw.split("\n");
  const titleLineIndex = lines.findIndex((line) => /^#\s+/.test(line));
  const slideTitle = titleLineIndex >= 0 ? lines[titleLineIndex].replace(/^#\s+/, "").trim() : `슬라이드 ${number}`;

  const sections = {};
  let current = null;

  for (const line of lines.slice(titleLineIndex >= 0 ? titleLineIndex + 1 : 0)) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match && SECTION_NAMES.includes(match[1].trim())) {
      current = match[1].trim();
      sections[current] = [];
      continue;
    }
    if (current) {
      sections[current].push(line);
    }
  }

  const composition = cleanSection(sections["화면 구성"]);
  const material = cleanSection(sections["자료"]);
  const mermaidBlocks = extractMermaidBlocks(composition);

  return {
    number,
    filePath,
    raw,
    slideTitle,
    screenTitle: cleanSection(sections["화면 제목"]),
    content: cleanSection(sections["화면 내용"]),
    composition,
    speakerNotes: cleanSection(sections["발표 메모"]),
    material,
    practiceAsset: extractPracticeAsset(material),
    mermaidBlocks,
  };
}

function cleanSection(lines = []) {
  return lines.join("\n").trim();
}

function extractMermaidBlocks(markdown) {
  const blocks = [];
  const pattern = /```mermaid\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    const code = match[1].trim();
    const firstLine = code.split("\n").find((line) => line.trim().length > 0) || "";
    const type = detectMermaidType(firstLine);
    blocks.push({ code, type });
  }

  return blocks;
}

function extractPracticeAsset(markdown) {
  if (!markdown) return null;

  const fileLabels = extractFileLabels(markdown);
  const codeBlocks = extractFencedCodeBlocks(markdown)
    .filter((block) => block.lang !== "mermaid")
    .map((block) => ({
      ...block,
      fileName: findNearestFileLabel(fileLabels, block.index),
    }));
  if (codeBlocks.length === 0) {
    return {
      raw: markdown,
      fileName: extractFileName(markdown),
      codeBlocks: [],
      primaryCode: null,
    };
  }

  const primaryCode = codeBlocks.find((block) => block.lang === "html") ?? codeBlocks[0];

  return {
    raw: markdown,
    fileName: extractFileName(markdown),
    codeBlocks,
    primaryCode,
  };
}

function extractFileName(markdown) {
  const backtickMatch = /^파일명\s*예시\s*:\s*`([^`]+)`\s*$/m.exec(markdown);
  if (backtickMatch) return backtickMatch[1].trim();

  const plainMatch = /^파일명\s*예시\s*:\s*(.+?)\s*$/m.exec(markdown);
  if (!plainMatch) return "";

  return plainMatch[1].replace(/^`|`$/g, "").trim();
}

function extractFileLabels(markdown) {
  const labels = [];
  const pattern = /^파일명\s*예시\s*:\s*(?:`([^`]+)`|(.+?))\s*$/gm;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    const name = (match[1] ?? match[2] ?? "").trim();
    if (name) {
      labels.push({ index: match.index, fileName: name.replace(/^`|`$/g, "").trim() });
    }
  }

  return labels;
}

function findNearestFileLabel(labels, blockIndex) {
  let nearest = "";

  for (const label of labels) {
    if (label.index > blockIndex) break;
    nearest = label.fileName;
  }

  return nearest;
}

function extractFencedCodeBlocks(markdown) {
  const blocks = [];
  const pattern = /```([a-zA-Z0-9_-]*)[^\n]*\n([\s\S]*?)```/g;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push({
      lang: match[1].trim().toLowerCase(),
      code: match[2].replace(/\n+$/g, ""),
      index: match.index,
    });
  }

  return blocks;
}

function detectMermaidType(firstLine) {
  const trimmed = firstLine.trim();
  if (trimmed.startsWith("flowchart")) return "flowchart";
  if (trimmed.startsWith("sequenceDiagram")) return "sequenceDiagram";
  if (trimmed.startsWith("timeline")) return "timeline";
  if (trimmed.startsWith("kanban")) return "kanban";
  if (trimmed.startsWith("mindmap")) return "mindmap";
  return trimmed.split(/\s+/)[0] || "unknown";
}
