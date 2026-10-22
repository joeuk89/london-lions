import { chromium } from 'playwright-core';
const [,, html, outDir] = process.argv;
const browser = await chromium.launch({ channel: 'chrome' });
for (const v of ['A','B','C']) {
  for (const venue of ['', 'changed']) {
    const q = `?variant=${v}${venue ? '&venue=changed' : ''}`;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await page.goto(`file://${html}${q}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const tag = `${v}${venue ? '-venue' : ''}`;
    if (!venue) {
      await page.screenshot({ path: `${outDir}/shot-${tag}-phone.png`, fullPage: true });
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.screenshot({ path: `${outDir}/shot-${tag}-desktop.png`, fullPage: true });
    } else {
      await page.screenshot({ path: `${outDir}/shot-${tag}-phone-top.png` });
    }
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: `${outDir}/programme-${tag}.pdf`, preferCSSPageSize: true, printBackground: true });
    await page.close();
  }
}
await browser.close();
