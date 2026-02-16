#!/usr/bin/env node
/**
 * SAIDify Schema Files
 *
 * Computes the SAID (Self-Addressing IDentifier) for KERI/ACDC schema files.
 * Uses SHA-256 hashing with CESR base64url encoding.
 *
 * IMPORTANT: KERI requires the JSON to be serialized in the EXACT field order
 * as it appears in the file, with the $id replaced by a placeholder.
 *
 * Usage: node saidify.js <schema-file.json>
 * Or:    node saidify.js --all  (to process all schema files)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// SAID placeholder - 44 '#' characters (same length as final SAID)
const SAID_PLACEHOLDER = '#'.repeat(44);

/**
 * Recursively serialize JSON preserving key order as they appear in the object.
 * This is critical for KERI SAID computation.
 */
function canonicalJsonStringify(obj) {
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    const items = obj.map(item => canonicalJsonStringify(item));
    return '[' + items.join(',') + ']';
  }

  if (typeof obj === 'object') {
    // Preserve insertion order (as Object.keys does in modern JS)
    const pairs = Object.keys(obj).map(key => {
      return JSON.stringify(key) + ':' + canonicalJsonStringify(obj[key]);
    });
    return '{' + pairs.join(',') + '}';
  }

  return String(obj);
}

/**
 * Base64url encode a buffer (no padding)
 */
function base64urlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Compute SAID using SHA-256
 * Returns a 44-character SAID: 'E' prefix + 43 chars base64url
 */
function computeSAID(jsonBytes) {
  const hash = crypto.createHash('sha256').update(jsonBytes).digest();
  // KERI SAID format: 'E' prefix indicates SHA-256 (Matter code)
  // The hash is 32 bytes = 256 bits, base64url encodes to 43 chars
  return 'E' + base64urlEncode(hash);
}

/**
 * Parse JSON while preserving key order
 * Returns the parsed object with keys in their original order
 */
function parseJsonPreservingOrder(jsonStr) {
  // JSON.parse in modern JS preserves insertion order for objects
  return JSON.parse(jsonStr);
}

/**
 * Replace $id with placeholder while preserving structure
 */
function replaceIdWithPlaceholder(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => replaceIdWithPlaceholder(item));
  }

  const result = {};
  for (const key of Object.keys(obj)) {
    if (key === '$id') {
      result[key] = SAID_PLACEHOLDER;
    } else {
      result[key] = replaceIdWithPlaceholder(obj[key]);
    }
  }
  return result;
}

/**
 * SAIDify a schema - compute its SAID
 */
function saidifySchema(schema) {
  // Replace $id with placeholder
  const schemaWithPlaceholder = replaceIdWithPlaceholder(schema);

  // Serialize to compact JSON (preserving field order)
  const jsonStr = canonicalJsonStringify(schemaWithPlaceholder);

  // Compute SAID from UTF-8 bytes
  const jsonBytes = Buffer.from(jsonStr, 'utf8');
  const said = computeSAID(jsonBytes);

  // Return original schema structure with computed SAID
  const result = { ...schema };
  result.$id = said;
  return result;
}

/**
 * Process a schema file
 */
function processSchemaFile(filePath) {
  console.log(`Processing: ${filePath}`);

  // Read and parse schema (preserving key order)
  const content = fs.readFileSync(filePath, 'utf8');
  const schema = parseJsonPreservingOrder(content);

  const oldId = schema.$id;

  // SAIDify
  const saidifiedSchema = saidifySchema(schema);

  console.log(`  Old $id: ${oldId}`);
  console.log(`  New $id: ${saidifiedSchema.$id}`);

  if (oldId === saidifiedSchema.$id) {
    console.log('  (no change)');
  } else {
    // Write back with proper formatting (2-space indent, preserve key order)
    const output = JSON.stringify(saidifiedSchema, null, 4) + '\n';
    fs.writeFileSync(filePath, output);
    console.log('  Updated!');
  }

  return saidifiedSchema.$id;
}

/**
 * Find all schema files in the directory
 */
function findSchemaFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f.startsWith('matou-'))
    .map(f => path.join(dir, f));
}

// Main
const args = process.argv.slice(2);
const schemaDir = __dirname;

if (args.length === 0 || args[0] === '--help') {
  console.log('Usage: node saidify.js <schema-file.json>');
  console.log('       node saidify.js --all');
  console.log('');
  console.log('Computes KERI SAIDs for schema files.');
  console.log('The $id field is replaced with the computed SAID.');
  process.exit(0);
}

const results = {};

if (args[0] === '--all') {
  const files = findSchemaFiles(schemaDir);
  console.log(`Found ${files.length} schema files\n`);

  for (const file of files) {
    const said = processSchemaFile(file);
    const name = path.basename(file, '.json');
    results[name] = said;
    console.log('');
  }
} else {
  const filePath = path.resolve(args[0]);
  const said = processSchemaFile(filePath);
  const name = path.basename(filePath, '.json');
  results[name] = said;
}

console.log('\n=== SAIDs for code ===\n');
for (const [name, said] of Object.entries(results)) {
  const constName = name
    .replace('matou-', '')
    .replace(/-/g, '_')
    .toUpperCase()
    .replace('_SCHEMA', '_SCHEMA_SAID');
  console.log(`const ${constName} = '${said}';`);
}
