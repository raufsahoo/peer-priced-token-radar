// Author-side tool: captures the three screenshots the judge sees from a built out/dashboard.
// Run main.ts first (it writes out/data.js and out/dashboard even before screenshots exist), then:
//   node tools/shoot.mjs [out-dir] [browser-path]
// Writes screenshots/1-board.png, 2-detail.png and 3-filtered.png at 1440 x 900 (the gate wants a long side
// of at most 1440 and a short side of at least 800 pixels, each file at most 512 KiB).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'out'));
const browser = [process.argv[3], 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean).find((b) => existsSync(b));
if (!browser) throw new Error('no headless browser found');
const page = pathToFileURL(join(out, 'dashboard', 'index.html')).href;
const shots = [
  ['1-board.png', ''],
  ['2-detail.png', '#p=steakhouse-financial'],
  ['3-filtered.png', '#cat=Risk+Curators&up=1&sort=change_7d&dir=desc'],
  // The traded peers behind every multiple, kept apart from the pre-token board (the gate allows up to 4).
  ['4-traded.png', '#tab=traded'],
];
mkdirSync(join(root, 'screenshots'), { recursive: true });
for (const [name, hash] of shots) {
  const file = join(root, 'screenshots', name);
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', '--virtual-time-budget=3000', '--window-size=1440,900', `--screenshot=${file}`, page + hash], { stdio: 'ignore' });
  const bytes = statSync(file).size;
  if (bytes > 524_288) throw new Error(`${name} is ${bytes} bytes, over 512 KiB`);
  console.log(`${name}: ${bytes} bytes`);
}
