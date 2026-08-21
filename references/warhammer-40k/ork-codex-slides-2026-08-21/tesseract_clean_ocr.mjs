import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScheduler, createWorker, OEM, PSM } from "file:///C:/Users/askel/AppData/Local/Temp/warforge-tesseract/node_modules/tesseract.js/src/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const useColumnsV3 = process.argv.includes("--columns-v3");
const useColumnsV2 = process.argv.includes("--columns-v2");
const useColumns = useColumnsV3 || useColumnsV2 || process.argv.includes("--columns");
const useDatasheets = process.argv.includes("--datasheets");
const useDatasheetColumns = process.argv.includes("--datasheet-columns");
const manifestName = useDatasheetColumns ? "datasheet-columns.json" : useDatasheets ? "datasheets.json" : useColumnsV3 ? "columns-v3.json" : useColumnsV2 ? "columns-v2.json" : useColumns ? "columns.json" : "inputs.json";
const fileField = useDatasheetColumns ? "datasheetColumnFile" : useDatasheets ? "sectionFile" : useColumns ? "columnFile" : "inputFile";
const outputDir = path.join(root, "clean-ocr", useDatasheetColumns ? "tesseract-datasheet-columns" : useDatasheets ? "tesseract-datasheets" : useColumnsV3 ? "tesseract-columns-v3" : useColumnsV2 ? "tesseract-columns-v2" : useColumns ? "tesseract-columns" : "tesseract");
const inputManifest = JSON.parse(await fs.readFile(path.join(root, "clean-ocr", manifestName), "utf8"));
const langPath = "C:/Users/askel/AppData/Local/Temp/warforge-tesseract/node_modules/@tesseract.js-data/eng/4.0.0_best_int";
await fs.mkdir(outputDir, { recursive: true });

const scheduler = createScheduler();
for (let index = 0; index < 2; index += 1) {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath,
    gzip: true,
    cacheMethod: "none",
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
  });
  scheduler.addWorker(worker);
}

let completed = 0;
const jobs = inputManifest.map(async (entry) => {
  const stem = path.basename(entry[fileField], path.extname(entry[fileField]));
  const output = path.join(outputDir, `${stem}.json`);
  try {
    await fs.access(output);
    completed += 1;
    process.stdout.write(`[${completed}/${inputManifest.length}] ${stem}: already complete\n`);
    return;
  } catch {}
  const result = await scheduler.addJob(
    "recognize",
    path.join(root, entry[fileField]),
    {},
    { text: true, blocks: true, tsv: true, hocr: false, box: false, unlv: false, osd: false, pdf: false, imageColor: false, imageGrey: false, imageBinary: false, debug: false },
  );
  const record = {
    ...entry,
    confidence: result.data.confidence,
    text: result.data.text,
    tsv: result.data.tsv,
    blocks: result.data.blocks,
  };
  await fs.writeFile(output, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  completed += 1;
  process.stdout.write(`[${completed}/${inputManifest.length}] ${stem}: confidence ${result.data.confidence.toFixed(1)}\n`);
});

await Promise.all(jobs);
await scheduler.terminate();
process.stdout.write(`Completed ${completed} OCR regions\n`);
