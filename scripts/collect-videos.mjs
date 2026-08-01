#!/usr/bin/env node
/**
 * Collect Playwright videos after a run into a timestamped folder and convert
 * them to MP4.
 *
 *   node scripts/collect-videos.mjs [short description]
 *
 * Output: test-videos/<YYYY-MM-DD_HH-mm-ss>_<slugified-description>/
 * One .mp4 per recorded test (Playwright's .webm stays in test-results/).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = 'test-results';
const OUT_ROOT = 'test-videos';

function timestamp(d = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function slugify(s) {
  return (s || 'e2e-run').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'e2e-run';
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name === 'video.webm') yield full;
  }
}

const desc = slugify(process.argv.slice(2).join(' '));
const outDir = path.join(OUT_ROOT, `${timestamp()}_${desc}`);
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(RESULTS_DIR)) {
  console.log(`No ${RESULTS_DIR} directory — run the tests first.`);
  process.exit(1);
}

const videos = [...walk(RESULTS_DIR)];
if (videos.length === 0) {
  console.log('No video.webm files found. (Is video: "on" set for browser projects?)');
  process.exit(0);
}

let converted = 0;
for (const [i, webm] of videos.entries()) {
  const testName = path.basename(path.dirname(webm)).slice(0, 80) || `test-${i + 1}`;
  const mp4 = path.join(outDir, `${testName}.mp4`);
  try {
    execFileSync('ffmpeg', [
      '-y', '-i', webm,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      mp4,
    ], { stdio: 'ignore' });
    converted++;
  } catch {
    // ffmpeg missing or failed — fall back to copying the webm
    fs.copyFileSync(webm, path.join(outDir, `${testName}.webm`));
  }
}

console.log(`Collected ${converted}/${videos.length} video(s) as MP4 → ${outDir}`);
