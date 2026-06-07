#!/usr/bin/env node

import { Command } from "commander";
import { buildDeck } from "./deck.js";
import { parseMarkdown } from "./parser.js";
import { validateSlides } from "./validate.js";

const program = new Command();

program
  .name("mdslide")
  .description("Generate 16:9 PPTX decks from structured Markdown with Mermaid diagrams.")
  .version("0.1.0");

program
  .command("validate")
  .argument("<input>", "Markdown input file")
  .action(async (input) => {
    const slides = await parseMarkdown(input);
    const result = validateSlides(slides);
    printValidation(result);
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  });

program
  .command("build")
  .argument("<input>", "Markdown input file")
  .requiredOption("-o, --out <path>", "Output PPTX path")
  .option("--keep-artifacts", "Keep rendered Mermaid SVG/PNG artifacts", false)
  .action(async (input, options) => {
    try {
      const result = await buildDeck(input, options.out, {
        keepArtifacts: options.keepArtifacts,
      });
      printValidation(result.validation);
      if (result.validation.errors.length > 0) {
        process.exitCode = 1;
        return;
      }
      console.log(`Wrote ${result.deckPath}`);
      console.log(`Wrote ${result.notesPath}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);

function printValidation(result) {
  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log("Validation passed.");
    return;
  }

  for (const error of result.errors) {
    console.error(`ERROR slide ${error.slideNumber}: ${error.message}`);
  }
  for (const warning of result.warnings) {
    console.warn(`WARN slide ${warning.slideNumber}: ${warning.message}`);
  }
}
