// Publishes the single-file build as dist/offline.html (run after `vite build --mode single`).
// Fails if the file still references anything outside itself, so the offline copy can't silently
// depend on the network or on files beside it.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const src = 'dist-single/index.html';
const html = readFileSync(src, 'utf8');
// Resource tags only (links inside the app, like "Other chapters", are navigation, not dependencies).
const external = [...html.matchAll(/<(?:link|script|img|source|iframe)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'));
// Fonts and images referenced from CSS must have been inlined too.
for (const m of html.matchAll(/url\(\s*["']?([^"')]+)/g)) {
  if (!m[1].startsWith('data:') && !m[1].startsWith('#') && !m[1].startsWith('%23')) external.push(m[1]);
}
if (external.length) {
  console.error(`offline.html must be self-contained, but it references: ${external.join(', ')}`);
  process.exit(1);
}
if (!existsSync('dist')) mkdirSync('dist');
copyFileSync(src, 'dist/offline.html');
rmSync('dist-single', { recursive: true, force: true });
console.log(`dist/offline.html: ${Math.round(html.length / 1024)} KB, self-contained`);
