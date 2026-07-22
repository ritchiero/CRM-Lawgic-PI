#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9ñÑ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells;
}

function isTokenSubset(shorter, longer) {
  const shortTokens = shorter.split(' ');
  const longTokens = longer.split(' ');
  if (shortTokens.length >= longTokens.length || shortTokens.length < 2) return false;
  return shortTokens.every((token) => longTokens.includes(token));
}

function main() {
  const csvPath = process.argv[2];
  const reportPath = process.argv[3];
  if (!csvPath) throw new Error('Uso: node scripts/audit-representative-coverage.cjs <targets.csv> [report.json]');

  const repoRoot = path.resolve(__dirname, '..');
  const overridesPath = path.join(repoRoot, 'src/data/representativeActivityOverrides.ts');
  const correctionsPath = path.join(repoRoot, 'src/data/representativeActivityCorrections.ts');
  const csvLines = fs.readFileSync(path.resolve(csvPath), 'utf8').split(/\r?\n/).filter(Boolean);
  const names = csvLines.slice(1).map((line) => parseCsvLine(line)[0]).filter(Boolean);
  const canonicalByKey = new Map();
  for (const name of names) {
    const key = normalizeName(name);
    const values = canonicalByKey.get(key) || [];
    values.push(name);
    canonicalByKey.set(key, values);
  }

  const activitySources = [overridesPath, correctionsPath]
    .filter((sourcePath) => fs.existsSync(sourcePath))
    .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
    .join('\n');
  const overrideKeys = [...activitySources.matchAll(/^  "([^"]+)": \{$/gm)].map((match) => normalizeName(match[1]));
  const overrideSet = new Set(overrideKeys);
  const canonicalKeys = [...canonicalByKey.keys()];
  const exact = canonicalKeys.filter((key) => overrideSet.has(key));
  const missing = canonicalKeys.filter((key) => !overrideSet.has(key));
  const extra = overrideKeys.filter((key) => !canonicalByKey.has(key));

  const partialMatches = missing.map((canonicalKey) => {
    const candidates = overrideKeys.filter((overrideKey) =>
      isTokenSubset(overrideKey, canonicalKey) || isTokenSubset(canonicalKey, overrideKey)
    );
    return {
      name: canonicalByKey.get(canonicalKey)[0],
      normalized: canonicalKey,
      candidates: [...new Set(candidates)],
    };
  }).filter((item) => item.candidates.length > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    source: path.basename(csvPath),
    csvRows: names.length,
    uniqueCanonicalNames: canonicalKeys.length,
    publishedOverrideNames: overrideSet.size,
    exactVerifiedNames: exact.length,
    missingExactVerification: missing.length,
    partialOrTruncatedCandidates: partialMatches.length,
    duplicateCanonicalKeys: [...canonicalByKey.entries()]
      .filter(([, values]) => values.length > 1)
      .map(([normalized, values]) => ({ normalized, values })),
    partialMatches,
    missingNames: missing.map((key) => canonicalByKey.get(key)[0]),
    publishedNamesNotInCurrentTargets: [...new Set(extra)],
  };

  if (reportPath) fs.writeFileSync(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    generatedAt: report.generatedAt,
    source: report.source,
    csvRows: report.csvRows,
    uniqueCanonicalNames: report.uniqueCanonicalNames,
    publishedOverrideNames: report.publishedOverrideNames,
    exactVerifiedNames: report.exactVerifiedNames,
    missingExactVerification: report.missingExactVerification,
    partialOrTruncatedCandidates: report.partialOrTruncatedCandidates,
    duplicateCanonicalKeys: report.duplicateCanonicalKeys.length,
    reportPath: reportPath ? path.resolve(reportPath) : null,
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
