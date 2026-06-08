import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import sharp from "sharp";

const VIEWPORT = {
  width: 1280,
  height: 800,
  deviceScaleFactor: 2,
};

export async function renderPracticeAssets(slides, options = {}) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "mdslide-html-"));
  const artifacts = [];
  const renderTargets = slides.filter((slide) => slide.practiceAsset?.primaryCode?.lang === "html");

  if (renderTargets.length === 0) {
    return {
      slides,
      cleanup: async () => {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  }

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    for (const slide of renderTargets) {
      const code = slide.practiceAsset.primaryCode.code;
      const baseName = `slide-${slide.number}-practice`;
      const htmlPath = path.join(workDir, `${baseName}.html`);
      const pngPath = path.join(workDir, `${baseName}.png`);

      await writeFile(htmlPath, code, "utf8");
      await renderHtmlToPng(browser, code, pngPath);

      const metadata = await sharp(pngPath).metadata();
      artifacts.push(htmlPath, pngPath);
      slide.renderedPractice = {
        pngPath,
        widthPx: metadata.width,
        heightPx: metadata.height,
      };
    }
  } finally {
    await browser.close();
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

async function renderHtmlToPng(browser, html, outputPath) {
  const page = await browser.newPage();

  try {
    await page.setViewport(VIEWPORT);
    await page.setContent(html, {
      waitUntil: ["load", "networkidle0"],
      timeout: 8000,
    });
    await page.evaluate(() => {
      const htmlStyle = window.getComputedStyle(document.documentElement);
      const bodyStyle = window.getComputedStyle(document.body);
      const transparent = "rgba(0, 0, 0, 0)";

      if (htmlStyle.backgroundColor === transparent && bodyStyle.backgroundColor === transparent) {
        document.documentElement.style.backgroundColor = "#ffffff";
        document.body.style.backgroundColor = "#ffffff";
      }
    });
    await page.screenshot({
      path: outputPath,
      clip: {
        x: 0,
        y: 0,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
    });
  } finally {
    await page.close();
  }
}
