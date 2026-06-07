import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { execa } from "./process.js";

export async function renderMermaidBlocks(slides, options = {}) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "mdslide-"));
  const artifacts = [];
  const puppeteerConfigPath = path.join(workDir, "puppeteer-config.json");
  const mermaidConfigPath = path.join(workDir, "mermaid-config.json");
  const mermaidCssPath = path.join(workDir, "mermaid.css");

  await writeFile(
    puppeteerConfigPath,
    JSON.stringify({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    }),
    "utf8",
  );
  await writeFile(mermaidConfigPath, JSON.stringify(buildMermaidConfig()), "utf8");
  await writeFile(mermaidCssPath, buildMermaidCss(), "utf8");

  for (const slide of slides) {
    slide.renderedMermaid = [];

    for (let index = 0; index < slide.mermaidBlocks.length; index += 1) {
      const block = slide.mermaidBlocks[index];
      const baseName = `slide-${slide.number}-${index + 1}`;
      const inputPath = path.join(workDir, `${baseName}.mmd`);
      const pngPath = path.join(workDir, `${baseName}.png`);
      const finalPngPath = path.join(workDir, `${baseName}.final.png`);

      await writeFile(inputPath, withDiagramConfig(block.code), "utf8");
      await execa("npx", [
        "mmdc",
        "-i",
        inputPath,
        "-o",
        pngPath,
        "-b",
        "transparent",
        "-w",
        "1800",
        "-H",
        "1100",
        "-c",
        mermaidConfigPath,
        "--cssFile",
        mermaidCssPath,
        "-p",
        puppeteerConfigPath,
        "--scale",
        "2",
      ]);

      await padRenderedPng(pngPath, finalPngPath, block.type);

      const metadata = await sharp(finalPngPath).metadata();
      artifacts.push(inputPath, pngPath, finalPngPath);
      slide.renderedMermaid.push({
        ...block,
        pngPath: finalPngPath,
        widthPx: metadata.width,
        heightPx: metadata.height,
      });
    }
  }

  return {
    slides,
    cleanup: async () => {
      if (options.keepArtifacts) return;
      for (const artifact of artifacts) {
        await rm(artifact, { force: true }).catch(() => {});
      }
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

async function padRenderedPng(inputPath, outputPath, type) {
  const padding =
    type === "sequenceDiagram"
      ? { top: 32, bottom: 150, left: 48, right: 48 }
      : { top: 18, bottom: 28, left: 18, right: 18 };

  await sharp(inputPath)
    .extend({
      ...padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);
}

function withDiagramConfig(code) {
  const trimmed = code.trim();

  if (trimmed.startsWith("sequenceDiagram")) {
    return `%%{init: {"sequence": {"diagramMarginY": 42, "messageMargin": 42, "bottomMarginAdj": 24}}}%%\n${code}`;
  }

  if (trimmed.startsWith("flowchart")) {
    return `%%{init: {"markdownAutoWrap": false, "flowchart": {"defaultRenderer": "dagre-wrapper", "htmlLabels": true, "wrappingWidth": 260, "nodeSpacing": 55, "rankSpacing": 85, "curve": "basis"}}}%%\n${code}`;
  }

  return code;
}

function buildMermaidConfig() {
  return {
    startOnLoad: false,
    securityLevel: "loose",
    markdownAutoWrap: false,
    theme: "base",
    themeVariables: {
      fontFamily: "Apple SD Gothic Neo, Noto Sans CJK KR, Arial, sans-serif",
      fontSize: "18px",
      primaryColor: "#ffffff",
      primaryTextColor: "#172033",
      primaryBorderColor: "#cbd5e1",
      lineColor: "#64748b",
      secondaryColor: "#f8fafc",
      tertiaryColor: "#eef2ff",
      noteBkgColor: "#f8fafc",
      noteTextColor: "#334155",
      actorBorder: "#8b5cf6",
      actorBkg: "#f5f3ff",
      actorTextColor: "#172033",
      signalColor: "#334155",
      signalTextColor: "#172033",
    },
    flowchart: {
      defaultRenderer: "dagre-wrapper",
      htmlLabels: true,
      wrappingWidth: 260,
      nodeSpacing: 55,
      rankSpacing: 85,
      curve: "basis",
    },
    sequence: {
      mirrorActors: false,
      showSequenceNumbers: false,
      messageAlign: "center",
      actorMargin: 70,
      width: 170,
      height: 60,
      boxMargin: 10,
      noteMargin: 10,
      messageMargin: 42,
      diagramMarginY: 42,
      bottomMarginAdj: 24,
    },
  };
}

function buildMermaidCss() {
  return `
    .nodeLabel,
    .label,
    .labelBkg,
    .edgeLabel,
    .cluster-label,
    .kanban-label {
      font-family: "Apple SD Gothic Neo", "Noto Sans CJK KR", Arial, sans-serif !important;
    }

    .flowchart-link {
      stroke-width: 2.5px !important;
    }
  `;
}
