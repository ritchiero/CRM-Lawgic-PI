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

function activityLevel(count) {
  if (count >= 200) return 'Alta';
  if (count >= 75) return 'Media';
  if (count >= 25) return 'Baja';
  return 'Incipiente';
}

const CLEAN_QUERY_RESULTS = {
  'patricia kaim fonseca miembro amppi': {
    count: 1318,
    query: '"PATRICIA KAIM FONSECA"',
  },
  'victor valencia lawgic one': {
    count: 0,
    query: '"VICTOR VALENCIA"',
  },
  'ramon alberto ballesteros valadez': {
    count: 0,
    query: '"RAMON ALBERTO BALLESTEROS VALADEZ"',
  },
};

function quote(value) {
  return JSON.stringify(String(value));
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Uso: node scripts/render-representative-corrections.cjs <resultados.jsonl>');

  const repoRoot = path.resolve(__dirname, '..');
  const outputPath = path.join(repoRoot, 'src/data/representativeActivityCorrections.ts');
  const latest = new Map();
  for (const line of fs.readFileSync(path.resolve(inputPath), 'utf8').split(/\r?\n/).filter(Boolean)) {
    const result = JSON.parse(line);
    const key = normalizeName(result.name);
    const cleaned = CLEAN_QUERY_RESULTS[key];
    if (cleaned) {
      result.representativeActivityCount = cleaned.count;
      result.representativeActivityLevel = activityLevel(cleaned.count);
      result.impiRawExpedientCount = cleaned.count;
      result.impiUniqueExpedientCount = cleaned.count;
      result.exactAgentQuery = cleaned.query;
      result.representativeActivityVerifiedAt = new Date().toISOString();
    }
    latest.set(key, result);
  }

  const entries = [...latest.entries()].sort(([left], [right]) => left.localeCompare(right, 'es'));
  const body = entries.map(([key, result]) => {
    const verifiedAt = new Date(result.representativeActivityVerifiedAt).toISOString();
    return `  ${quote(key)}: {\n`
      + '    representativeActivityVerified: true,\n'
      + `    representativeActivityLevel: ${quote(result.representativeActivityLevel)},\n`
      + "    representativeActivityVerificationStatus: 'verified',\n"
      + `    representativeActivityCount: ${Number(result.representativeActivityCount).toLocaleString('en-US').replace(/,/g, '_')},\n`
      + '    activityClassificationBasis: "verified_marcia_exact_agent_records",\n'
      + '    impiProfileCount: 1,\n'
      + '    impiProfilesProcessed: 1,\n'
      + `    impiRawExpedientCount: ${Number(result.impiRawExpedientCount).toLocaleString('en-US').replace(/,/g, '_')},\n`
      + `    impiUniqueExpedientCount: ${Number(result.impiUniqueExpedientCount).toLocaleString('en-US').replace(/,/g, '_')},\n`
      + '    impiVerificationSource: "marcia_exact_agent_phrase",\n'
      + `    impiSourceIndexedAt: ${quote(result.impiSourceIndexedAt || '2020-02-02')},\n`
      + `    impiExactAgentQuery: ${quote(result.exactAgentQuery)},\n`
      + `    representativeActivityVerifiedAt: new Date(${quote(verifiedAt)}),\n`
      + '  },';
  }).join('\n');

  const source = `import type { RepresentativeActivityOverride } from './representativeActivityOverrides';

const corrections: Record<string, RepresentativeActivityOverride> = {
${body}
};

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-zA-Z0-9ñÑ]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

export function getRepresentativeActivityCorrection(name: string) {
  return corrections[normalizeName(name)];
}
`;

  fs.writeFileSync(outputPath, source, 'utf8');
  process.stdout.write(`${JSON.stringify({ corrections: entries.length, output: outputPath })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
