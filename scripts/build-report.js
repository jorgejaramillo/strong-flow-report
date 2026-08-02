#!/usr/bin/env node
/**
 * build-report.js — genera reports/<cliente>/<fecha>/report.html
 * a partir de templates/report.template.html + reports/<cliente>/<fecha>/data.json
 *
 * Uso: node scripts/build-report.js <cliente> <fecha>
 * Ej:  node scripts/build-report.js jorgejaramillo 2026-08-02
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const [, , client, date] = process.argv;

if (!client || !date) {
  console.error('Uso: node scripts/build-report.js <cliente> <fecha>');
  console.error('Ej:  node scripts/build-report.js jorgejaramillo 2026-08-02');
  process.exit(1);
}

const reportDir = join(ROOT, 'reports', client, date);
const dataPath = join(reportDir, 'data.json');
const templatePath = join(ROOT, 'templates', 'report.template.html');
const outputPath = join(reportDir, 'report.html');

const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
const template = readFileSync(templatePath, 'utf-8');

const html = template.replace('/*__REPORT_DATA__*/', JSON.stringify(data));

writeFileSync(outputPath, html, 'utf-8');
console.log(`✓ ${outputPath}`);
