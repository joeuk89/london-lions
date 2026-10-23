import { readFile } from 'node:fs/promises';
import { emailSummary } from './email.js';
import { renderProgramme } from './render.js';

const [dataPath, markdownPath] = process.argv.slice(2);
if (!markdownPath) {
  console.error('Usage: node src/programme/check.js <data.json> <programme.md>');
  process.exit(2);
}

try {
  const data = JSON.parse(await readFile(dataPath, 'utf8'));
  const { meta, warnings } = renderProgramme(data, await readFile(markdownPath, 'utf8'));
  emailSummary(meta);
  for (const w of warnings) console.log(`warning: ${w}`);
  console.log('OK: the programme renders.');
} catch (error) {
  console.log(`FAILED: ${error.message}`);
  process.exit(1);
}
