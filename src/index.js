'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');

function getInput(name, fallback = '') {
  const key = 'INPUT_' + name.replace(/ /g, '_').toUpperCase();
  return (process.env[key] ?? fallback).trim();
}

function setOutput(name, value) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) fs.appendFileSync(outFile, `${name}=${String(value)}\n`, 'utf8');
}

function writeSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) fs.appendFileSync(summaryFile, markdown + '\n', 'utf8');
}

function walkAssets(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAssets(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function analyzeBundle(distDir, budgets) {
  const files = walkAssets(distDir);
  let rawBytes = 0;
  let gzipBytes = 0;
  let jsGzipBytes = 0;
  let cssGzipBytes = 0;
  const rows = [];

  for (const f of files) {
    const buf = fs.readFileSync(f);
    const gz = zlib.gzipSync(buf).length;
    const ext = path.extname(f).toLowerCase();
    rawBytes += buf.length;
    gzipBytes += gz;
    if (['.js', '.mjs', '.cjs'].includes(ext)) jsGzipBytes += gz;
    if (ext === '.css') cssGzipBytes += gz;
    rows.push({
      file: path.relative(distDir, f),
      rawKb: Number((buf.length / 1024).toFixed(2)),
      gzipKb: Number((gz / 1024).toFixed(2)),
    });
  }

  rows.sort((a, b) => b.gzipKb - a.gzipKb);
  const totalKb = Number((rawBytes / 1024).toFixed(2));
  const gzipKb = Number((gzipBytes / 1024).toFixed(2));
  const jsGzipKb = Number((jsGzipBytes / 1024).toFixed(2));
  const cssGzipKb = Number((cssGzipBytes / 1024).toFixed(2));

  // Estimate 4G Fast (1.6 Mbps = 200 KB/s) download + parse penalty
  const estTransferSec = Number((gzipKb / 200).toFixed(2));
  const lcpRisk = jsGzipKb > budgets.maxJsKb || gzipKb > budgets.maxTotalKb ? 'HIGH' : jsGzipKb > budgets.maxJsKb * 0.8 ? 'MEDIUM' : 'LOW';

  const violations = [];
  if (jsGzipKb > budgets.maxJsKb) violations.push(`JS gzip ${jsGzipKb} KB > ${budgets.maxJsKb} KB`);
  if (cssGzipKb > budgets.maxCssKb) violations.push(`CSS gzip ${cssGzipKb} KB > ${budgets.maxCssKb} KB`);
  if (gzipKb > budgets.maxTotalKb) violations.push(`Total gzip ${gzipKb} KB > ${budgets.maxTotalKb} KB`);

  return { filesCount: files.length, totalKb, gzipKb, jsGzipKb, cssGzipKb, estTransferSec, lcpRisk, violations, rows };
}

function runSelfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-guard-'));
  try {
    fs.writeFileSync(path.join(tmp, 'app.js'), 'console.log("hello");'.repeat(100), 'utf8');
    fs.writeFileSync(path.join(tmp, 'styles.css'), 'body{margin:0;color:#111;}'.repeat(50), 'utf8');
    const res = analyzeBundle(tmp, { maxJsKb: 250, maxCssKb: 60, maxTotalKb: 450 });
    if (res.filesCount !== 2 || res.violations.length !== 0) {
      throw new Error('Expected 2 files and 0 violations in self-test');
    }
    console.log(`[SELF-TEST OK] bundle-size-cwv-guard scanned ${res.filesCount} assets (${res.gzipKb} KB gzip).`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) return runSelfTest();

  const distDir = getInput('dist-dir', 'dist');
  const budgets = {
    maxJsKb: parseFloat(getInput('max-js-kb', '250')) || 250,
    maxCssKb: parseFloat(getInput('max-css-kb', '60')) || 60,
    maxTotalKb: parseFloat(getInput('max-total-kb', '450')) || 450,
  };

  const res = analyzeBundle(distDir, budgets);
  const passed = res.violations.length === 0;
  setOutput('total-kb', res.totalKb);
  setOutput('gzip-kb', res.gzipKb);
  setOutput('budget-passed', passed ? 'true' : 'false');

  const lines = [
    '## Bundle Size & Core Web Vitals Budget Guard',
    '',
    `- **Total Raw:** ${res.totalKb} KB | **Total Gzip:** ${res.gzipKb} KB`,
    `- **JS Gzip:** ${res.jsGzipKb} KB (Budget: ${budgets.maxJsKb} KB) | **CSS Gzip:** ${res.cssGzipKb} KB (Budget: ${budgets.maxCssKb} KB)`,
    `- **Est. 4G Transfer:** ${res.estTransferSec}s | **CWV LCP Risk:** ${res.lcpRisk}`,
    `- **Status:** ${passed ? 'PASSED' : 'FAILED (' + res.violations.join('; ') + ')'}`,
    '',
    '| Asset | Raw (KB) | Gzip (KB) |',
    '|-------|----------|-----------|',
  ];
  for (const r of res.rows.slice(0, 20)) lines.push(`| \`${r.file}\` | ${r.rawKb} | ${r.gzipKb} |`);
  writeSummary(lines.join('\n'));

  if (!passed) {
    console.log(`::error::Bundle budget exceeded: ${res.violations.join('; ')}`);
    process.exitCode = 1;
  }
}

main();
