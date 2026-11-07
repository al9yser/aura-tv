// Copies the playback libraries (hls.js, mpegts.js) from node_modules into www/vendor
// so the app works fully offline-bundled inside the APK.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';

const jobs = [
  ['node_modules/hls.js/dist/hls.min.js', 'www/vendor/hls.min.js'],
  ['node_modules/mpegts.js/dist/mpegts.js', 'www/vendor/mpegts.js'],
];
mkdirSync('www/vendor', { recursive: true });
for (const [from, to] of jobs) {
  if (!existsSync(from)) { console.error(`MISSING ${from} - did "npm install" run?`); process.exit(1); }
  copyFileSync(from, to);
  const kb = Math.round(statSync(to).size / 1024);
  if (kb < 100) { console.error(`${to} is suspiciously small (${kb} KB)`); process.exit(1); }
  console.log(`copied ${to} (${kb} KB)`);
}
