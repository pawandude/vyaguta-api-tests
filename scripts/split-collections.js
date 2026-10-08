/**
 * Splits the master collection into per-module collection files.
 * Run once (or after adding new folders to the master):
 *   node scripts/split-collections.js
 *
 * Related folders are merged into one module file:
 *   Team + Teams Write Operations  → modules/teams.postman_collection.json
 *   Pulse + Pulse Write Operations → modules/pulse.postman_collection.json
 */

const fs = require('fs');
const path = require('path');

const MASTER = path.join(__dirname, '..', 'collections', 'vyaguta-api.postman_collection.json');
const OUT_DIR = path.join(__dirname, '..', 'collections', 'modules');

const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));

// Map: output filename → array of folder names from master to include
const MODULE_MAP = {
  'sanity':      ['Sanity'],
  'health':      ['Health'],
  'people':      ['People'],
  'teams':       ['Team', 'Teams Write Operations'],
  'attendance':  ['Attendance'],
  'jump':        ['JUMP'],
  'honor':       ['Honor'],
  'okr':         ['OKR'],
  'pulse':       ['Pulse', 'Pulse Write Operations'],
  'core':        ['Core'],
  'edge-cases':  ['Behavior & Edge Cases'],
};

const allMasterFolders = master.item.map(f => f.name);
let written = 0;

for (const [slug, folderNames] of Object.entries(MODULE_MAP)) {
  const folders = folderNames.map(name => {
    const found = master.item.find(f => f.name === name);
    if (!found) {
      console.warn(`  WARN: folder "${name}" not found in master — skipping`);
    }
    return found;
  }).filter(Boolean);

  if (folders.length === 0) {
    console.warn(`  SKIP: no folders found for module "${slug}"`);
    continue;
  }

  const totalRequests = folders.reduce((n, f) => n + (f.item || []).length, 0);
  const displayName = folderNames.join(' + ');

  const moduleCol = {
    info: {
      name: `Vyaguta — ${displayName}`,
      description: `Module tests: ${displayName}. Part of the Vyaguta API test suite.`,
      schema: master.info.schema,
    },
    auth: master.auth,
    item: folders,
    variable: master.variable || [],
  };

  const outPath = path.join(OUT_DIR, `${slug}.postman_collection.json`);
  fs.writeFileSync(outPath, JSON.stringify(moduleCol, null, 2));
  console.log(`  ✓ ${slug}.postman_collection.json  (${folders.length} folder(s), ${totalRequests} requests)`);
  written++;
}

// Sanity-check: flag any master folder not covered by MODULE_MAP
const covered = new Set(Object.values(MODULE_MAP).flat());
const uncovered = allMasterFolders.filter(n => !covered.has(n));
if (uncovered.length) {
  console.warn('\n  WARN: these master folders are not in MODULE_MAP and were not exported:');
  uncovered.forEach(n => console.warn(`    - "${n}"`));
}

console.log(`\nDone — ${written} module collections written to collections/modules/`);
