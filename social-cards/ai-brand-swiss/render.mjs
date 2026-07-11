import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath   = join(__dirname, 'index.html').replace(/\\/g, '/');
const htmlUrl    = 'file:///' + htmlPath;
const outputDir  = join(__dirname, 'output');
mkdirSync(outputDir, { recursive: true });

console.log('Launching browser…');
const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 1600 });

console.log('Loading page…');
await page.goto(htmlUrl, { waitUntil: 'networkidle', timeout: 30000 });

// Wait for fonts to settle
await page.waitForTimeout(3000);

const posters = await page.$$('.poster.xhs');
console.log('Found ' + posters.length + ' posters');

for (let i = 0; i < posters.length; i++) {
  const num     = String(i + 1).padStart(2, '0');
  const outPath = join(outputDir, 'xhs-' + num + '.png');
  await posters[i].screenshot({ path: outPath });
  console.log('✓ xhs-' + num + '.png');
}

await browser.close();
console.log('\nDone! ' + posters.length + ' images saved to: ' + outputDir);
