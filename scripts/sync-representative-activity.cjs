#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'crm-lawgic-pi';
const DATABASE_ID = process.env.FIREBASE_DATABASE_ID || '(default)';
const ACCOUNT_EMAIL = process.env.FIREBASE_ACCOUNT_EMAIL;
const API_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}`;

function loadFirebaseAuth() {
  const candidates = [
    process.env.FIREBASE_TOOLS_AUTH_PATH,
    '/usr/local/lib/node_modules/firebase-tools/lib/auth.js',
    '/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  throw new Error('No se encontró firebase-tools. Define FIREBASE_TOOLS_AUTH_PATH.');
}

function parseArgs(argv) {
  const args = { apply: false, initialize: false, input: null, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') args.apply = true;
    else if (value === '--initialize') args.initialize = true;
    else if (value === '--input') args.input = argv[++index];
    else if (value === '--report') args.report = argv[++index];
    else throw new Error(`Argumento desconocido: ${value}`);
  }
  if (!args.initialize && !args.input) {
    throw new Error('Usa --initialize para clasificar el histórico o --input <jsonl> para importar verificaciones.');
  }
  return args;
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeValue(value, fieldName) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (fieldName.endsWith('At') || fieldName.endsWith('Until')) {
    return { timestampValue: new Date(value).toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeValue(item, 'item')) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value) } };
  }
  return { stringValue: String(value) };
}

function encodeFields(fields) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, encodeValue(value, key)])
  );
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

function loadResults(inputPath) {
  return fs.readFileSync(inputPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSON inválido en ${inputPath}:${index + 1}: ${error.message}`);
      }
    });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ACCOUNT_EMAIL) throw new Error('Define FIREBASE_ACCOUNT_EMAIL con una cuenta autorizada por Firebase CLI.');
  const firebaseAuth = loadFirebaseAuth();
  const account = firebaseAuth.findAccountByEmail(ACCOUNT_EMAIL);
  if (!account) throw new Error(`Firebase CLI no tiene autorizada la cuenta ${ACCOUNT_EMAIL}.`);
  const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, account.tokens.scopes || []);
  const accessToken = token.access_token;

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(body.error?.message || `Firestore HTTP ${response.status}`);
    return body;
  }

  async function listRepresentatives() {
    const documents = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ pageSize: '300', showMissing: 'false' });
      if (pageToken) params.set('pageToken', pageToken);
      const body = await apiRequest(`${API_ROOT}/documents/representatives?${params}`);
      for (const document of body.documents || []) {
        documents.push({
          id: document.name.split('/').pop(),
          data: decodeFields(document.fields || {}),
        });
      }
      pageToken = body.nextPageToken || '';
    } while (pageToken);
    return documents;
  }

  async function patchRepresentative(id, fields) {
    const params = new URLSearchParams();
    for (const field of Object.keys(fields)) params.append('updateMask.fieldPaths', field);
    return apiRequest(`${API_ROOT}/documents/representatives/${id}?${params}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: encodeFields(fields) }),
    });
  }

  const representatives = await listRepresentatives();
  const byName = new Map();
  for (const representative of representatives) {
    const key = normalizeName(representative.data.name);
    const group = byName.get(key) || [];
    group.push(representative);
    byName.set(key, group);
  }

  const updates = [];
  if (args.initialize) {
    for (const representative of representatives) {
      if (representative.data.representativeActivityVerified === true) continue;
      const count = Number(representative.data.brandCount || 0);
      updates.push({
        id: representative.id,
        name: representative.data.name,
        fields: {
          representativeActivityVerified: false,
          representativeActivityVerificationStatus: representative.data.representativeActivityVerificationStatus || 'pending',
          representativeActivityLevel: activityLevel(count),
          representativeActivityCount: count,
          activityClassificationBasis: 'historical_brand_count',
          activityClassifiedAt: new Date().toISOString(),
        },
      });
    }
  }

  const unmatchedResults = [];
  if (args.input) {
    for (const result of loadResults(path.resolve(args.input))) {
      const matches = byName.get(normalizeName(result.name)) || [];
      if (matches.length === 0) {
        unmatchedResults.push(result.name);
        continue;
      }
      for (const representative of matches) {
        updates.push({
          id: representative.id,
          name: representative.data.name,
          fields: {
            representativeActivityVerified: result.representativeActivityVerified === true,
            representativeActivityVerificationStatus: result.representativeActivityVerificationStatus,
            representativeActivityLevel: result.representativeActivityLevel,
            representativeActivityCount: result.representativeActivityCount,
            activityClassificationBasis: result.activityClassificationBasis,
            impiProfileCount: result.impiProfileCount,
            impiProfilesProcessed: result.impiProfilesProcessed,
            impiRawExpedientCount: result.impiRawExpedientCount,
            impiUniqueExpedientCount: result.impiUniqueExpedientCount,
            representativeActivityVerifiedAt: result.representativeActivityVerifiedAt,
            impiVerificationSource: result.source,
            impiSourceIndexedAt: result.impiSourceIndexedAt,
            impiExactAgentQuery: result.exactAgentQuery,
            impiVerificationError: result.verificationError,
          },
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    representatives: representatives.length,
    plannedUpdates: updates.length,
    unmatchedResults,
    applied: 0,
    failed: [],
    levels: updates.reduce((counts, update) => {
      const level = update.fields.representativeActivityLevel || 'Sin nivel';
      counts[level] = (counts[level] || 0) + 1;
      return counts;
    }, {}),
    examples: updates.slice(0, 8).map(({ id, name, fields }) => ({ id, name, fields })),
  };

  if (args.apply) {
    const concurrency = 10;
    for (let index = 0; index < updates.length; index += concurrency) {
      const chunk = updates.slice(index, index + concurrency);
      const settled = await Promise.allSettled(
        chunk.map((update) => patchRepresentative(update.id, update.fields))
      );
      settled.forEach((result, resultIndex) => {
        if (result.status === 'fulfilled') report.applied += 1;
        else report.failed.push({
          id: chunk[resultIndex].id,
          name: chunk[resultIndex].name,
          error: result.reason?.message || String(result.reason),
        });
      });
      process.stderr.write(`\rActualizados ${Math.min(index + chunk.length, updates.length)}/${updates.length}`);
    }
    process.stderr.write('\n');
  }

  if (args.report) {
    fs.writeFileSync(path.resolve(args.report), JSON.stringify(report, null, 2));
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
