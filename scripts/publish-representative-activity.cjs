#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const resultsFile = path.join(
  repoRoot,
  'src/app/target/scripts/runtime/representative_activity_results.jsonl'
);
const overridesFile = path.join(repoRoot, 'src/data/representativeActivityOverrides.ts');
const representativesFile = path.join(repoRoot, 'src/data/representativesData.ts');

function parseArgs(argv) {
  const args = { minimumNew: 10, force: false, push: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--minimum-new') args.minimumNew = Number(argv[++index]);
    else if (value === '--force') args.force = true;
    else if (value === '--push') args.push = true;
    else throw new Error(`Argumento desconocido: ${value}`);
  }
  if (!Number.isInteger(args.minimumNew) || args.minimumNew < 1) {
    throw new Error('--minimum-new debe ser un entero positivo');
  }
  return args;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

function loadVerifiedResults() {
  if (!fs.existsSync(resultsFile)) return [];
  const latest = new Map();
  for (const line of fs.readFileSync(resultsFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const result = JSON.parse(line);
    if (
      result.representativeActivityVerified === true
      && result.representativeActivityVerificationStatus === 'verified'
    ) {
      latest.set(normalizeName(result.name), result);
    }
  }
  return [...latest.values()].sort((left, right) => left.rank - right.rank);
}

function countPublishedOverrides(revision) {
  let source = '';
  try {
    source = execFileSync(
      'git',
      ['show', `${revision}:src/data/representativeActivityOverrides.ts`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch {
    return 0;
  }
  return Math.max(0, (source.match(/representativeActivityVerifiedAt:/g) || []).length - 1);
}

function quote(value) {
  return JSON.stringify(String(value));
}

function renderOverrides(results) {
  const entries = results.map((result) => {
    const verifiedAt = new Date(result.representativeActivityVerifiedAt).toISOString();
    const basis = result.activityClassificationBasis === 'verified_marcia_exact_agent_records'
      ? 'verified_marcia_exact_agent_records'
      : 'verified_unique_expedients';
    const sourceFields = [
      result.source ? `    impiVerificationSource: ${quote(result.source)},\n` : '',
      result.impiSourceIndexedAt ? `    impiSourceIndexedAt: ${quote(result.impiSourceIndexedAt)},\n` : '',
      result.exactAgentQuery ? `    impiExactAgentQuery: ${quote(result.exactAgentQuery)},\n` : '',
    ].join('');
    return `  ${quote(normalizeName(result.name))}: {\n`
      + `    representativeActivityVerified: true,\n`
      + `    representativeActivityLevel: ${quote(result.representativeActivityLevel)},\n`
      + `    representativeActivityVerificationStatus: 'verified',\n`
      + `    representativeActivityCount: ${Number(result.representativeActivityCount).toLocaleString('en-US').replace(/,/g, '_')},\n`
      + `    activityClassificationBasis: ${quote(basis)},\n`
      + `    impiProfileCount: ${Number(result.impiProfileCount)},\n`
      + `    impiProfilesProcessed: ${Number(result.impiProfilesProcessed)},\n`
      + `    impiRawExpedientCount: ${Number(result.impiRawExpedientCount).toLocaleString('en-US').replace(/,/g, '_')},\n`
      + `    impiUniqueExpedientCount: ${Number(result.impiUniqueExpedientCount).toLocaleString('en-US').replace(/,/g, '_')},\n`
      + sourceFields
      + `    representativeActivityVerifiedAt: new Date(${quote(verifiedAt)}),\n`
      + '  },';
  }).join('\n');

  return `import type { RepresentativeActivityLevel, RepresentativeActivityVerificationStatus } from '@/lib/representativeActivity';

export interface RepresentativeActivityOverride {
  representativeActivityVerified: boolean;
  representativeActivityLevel: RepresentativeActivityLevel;
  representativeActivityVerificationStatus: RepresentativeActivityVerificationStatus;
  representativeActivityCount: number;
  activityClassificationBasis: 'verified_unique_expedients' | 'verified_marcia_exact_agent_records';
  impiProfileCount: number;
  impiProfilesProcessed: number;
  impiRawExpedientCount: number;
  impiUniqueExpedientCount: number;
  impiVerificationSource?: string;
  impiSourceIndexedAt?: string;
  impiExactAgentQuery?: string;
  representativeActivityVerifiedAt: Date;
}

const overrides: Record<string, RepresentativeActivityOverride> = {
${entries}
};

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

export function getRepresentativeActivityOverride(name: string) {
  return overrides[normalizeName(name)];
}
`;
}

function updateHistoricalCounts(results) {
  const counts = new Map(results.map((result) => [
    normalizeName(result.name),
    Number(result.representativeActivityCount),
  ]));
  const source = fs.readFileSync(representativesFile, 'utf8');
  return source.replace(
    /(\{\s*rank:\s*\d+,\s*name:\s*"([^"]+)",\s*brandCount:\s*)\d+(\s*\})/g,
    (match, prefix, name, suffix) => {
      const count = counts.get(normalizeName(name));
      return count === undefined ? match : `${prefix}${count}${suffix}`;
    }
  );
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = loadVerifiedResults();
  let publishedRevision = 'HEAD';

  if (args.push) {
    git(['fetch', 'origin', 'main']);
    git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
    const ahead = Number(git(['rev-list', '--count', 'origin/main..HEAD'], { capture: true }).trim());
    if (ahead > 0) {
      git(['push', 'origin', 'HEAD:main']);
      publishedRevision = 'HEAD';
    } else {
      publishedRevision = 'origin/main';
    }
  }

  const published = countPublishedOverrides(publishedRevision);
  const pending = Math.max(0, results.length - published);

  if (!args.force && pending < args.minimumNew) {
    console.log(`Publicación aplazada: ${pending}/${args.minimumNew} resultados nuevos.`);
    return;
  }
  if (results.length === 0) {
    console.log('No hay resultados verificados para publicar.');
    return;
  }

  fs.writeFileSync(overridesFile, renderOverrides(results), 'utf8');
  fs.writeFileSync(representativesFile, updateHistoricalCounts(results), 'utf8');

  const diff = spawnSync(
    'git',
    ['diff', '--quiet', '--', overridesFile, representativesFile],
    { cwd: repoRoot, stdio: 'ignore' }
  );
  if (diff.status === 0) {
    console.log('Los resultados verificados ya están publicados.');
    return;
  }
  if (diff.status !== 1) {
    throw new Error(`No se pudo comprobar el diff de actividad (git ${diff.status}).`);
  }

  execFileSync('npx', ['tsc', '--noEmit'], { cwd: repoRoot, stdio: 'inherit' });
  git(['add', '--', overridesFile, representativesFile]);
  git(['commit', '-m', `Actualiza actividad verificada (${results.length} representantes)`]);
  if (args.push) {
    git(['push', 'origin', 'HEAD:main']);
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
