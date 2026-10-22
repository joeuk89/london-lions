import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

export const PAGE_WARNING = 12;

export async function renderPdf(htmlPath, pdfPath) {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
  return countPages(await readFile(pdfPath));
}

export const countPages = (pdf) => pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
