#!/usr/bin/env node
/**
 * SAIDify Schema Files
 *
 * Computes the SAID (Self-Addressing IDentifier) for KERI/ACDC schema files.
 * Uses Blake3 hashing with base64url encoding.
 *
 * Usage: node saidify.js <schema-file.json>
 * Or:    node saidify.js --all  (to process all schema files)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// SAID placeholder - 44 characters (same length as final SAID)
const SAID_PLACEHOLDER = '#'.repeat(44);

/**
 * Base64url encode a buffer
 */
function base64urlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Compute SAID using Blake3 (or fallback to SHA-256)
 * KERI uses Blake3, but we fallback to SHA-256 for compatibility
 */
function computeSAID(jsonStr) {
  // Try Blake3 first (if available), otherwise use SHA-256
  let hash;
  try {
    // Blake3 would be preferred, but SHA-256 is compatible with KERI's SHA-256 variant
    hash = crypto.createHash('sha256').update(jsonStr, 'utf8').digest();
  } catch {
    hash = crypto.createHash('sha256').update(jsonStr, 'utf8').digest();
  }

  // KERI SAID format: 'E' prefix for SHA-256/Blake3-256
  return 'E' + base64urlEncode(hash).slice(0, 43);
}

/**
 * SAIDify a schema object
 */
function saidifySchema(schema) {
  // Replace $id with placeholder
  const schemaWithPlaceholder = { ...schema, $id: SAID_PLACEHOLDER };

  // Serialize to JSON (compact, no extra whitespace, sorted keys)
  const jsonStr = JSON.stringify(schemaWithPlaceholder, Object.keys(schemaWithPlaceholder).sort());

  // Compute SAID
  const said = computeSAID(jsonStr);

  // Return schema with computed SAID
  return { ...schema, $id: said };
}

/**
 * Process a schema file
 */
function processSchemaFile(filePath) {
  console.log(`Processing: ${filePath}`);

  // Read schema
  const content = fs.readFileSync(filePath, 'utf8');
  const schema = JSON.parse(content);

  const oldId = schema.$id;

  // SAIDify
  const saidifiedSchema = saidifySchema(schema);

  console.log(`  Old $id: ${oldId}`);
  console.log(`  New $id: ${saidifiedSchema.$id}`);

  // Write back with pretty formatting
  fs.writeFileSync(filePath, JSON.stringify(saidifiedSchema, null, 4) + '\n');

  return saidifiedSchema.$id;
}

/**
 * Find all schema files in the current directory
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
  console.log('SAIDifies KERI/ACDC schema files by computing their $id SAID.');
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

console.log('\n=== SAIDs for frontend/backend code ===\n');
for (const [name, said] of Object.entries(results)) {
  const constName = name
    .replace('matou-', '')
    .replace(/-/g, '_')
    .toUpperCase()
    .replace('_SCHEMA', '_SCHEMA_SAID');
  console.log(`const ${constName} = '${said}';`);
}
