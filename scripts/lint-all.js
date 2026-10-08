/**
 * Validates JSON syntax for master collection, all module collections, and environments.
 * Exits with code 1 if any file is invalid.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const files = [
  path.join(ROOT, 'collections', 'vyaguta-api.postman_collection.json'),
  ...fs.readdirSync(path.join(ROOT, 'collections', 'modules'))
      .map(f => path.join(ROOT, 'collections', 'modules', f)),
  ...fs.readdirSync(path.join(ROOT, 'environments'))
      .map(f => path.join(ROOT, 'environments', f)),
];

let errors = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log(`  ✓ ${rel}`);
  } catch (e) {
    console.error(`  ✗ ${rel}: ${e.message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} file(s) have JSON errors.`);
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} files are valid JSON.`);
}
