import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPENER_PAGE_WARNING, PAGE_WARNING, renderPdf } from './pdf.js';
import { renderProgramme } from './render.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ASSETS = join(ROOT, 'assets');

export async function buildProgramme(dataPath, markdownPath, outDir) {
  const data = JSON.parse(await readFile(dataPath, 'utf8'));
  const markdown = await readFile(markdownPath, 'utf8');
  await mkdir(outDir, { recursive: true });

  const relativeTo = (target) => relative(resolve(outDir), target).split('\\').join('/') || '.';
  const { html, warnings } = renderProgramme(data, markdown, { assets: relativeTo(ASSETS), root: relativeTo(ROOT) });
  const htmlPath = join(outDir, 'index.html');
  await writeFile(htmlPath, html);

  const pages = await renderPdf(htmlPath, join(outDir, 'programme.pdf'));
  const limit = data.season_opener ? OPENER_PAGE_WARNING : PAGE_WARNING;
  if (pages > limit) warnings.push(`PDF runs to ${pages} A5 pages, more than ${limit}`);
  return { pages, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dataPath, markdownPath, outDir] = process.argv.slice(2);
  if (!outDir) {
    console.error('Usage: node src/programme/build.js <data.json> <programme.md> <out-dir>');
    process.exit(2);
  }
  const { pages, warnings } = await buildProgramme(dataPath, markdownPath, outDir);
  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`Wrote ${outDir}/index.html and programme.pdf (${pages} pages)`);
}
