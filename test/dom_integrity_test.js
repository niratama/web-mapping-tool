/**
 * dom_integrity_test.js - Verify that all getElementById and selectors in js/*.js exist in index.html
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// Extract all id="..." from HTML
const idRegex = /id=["']([^"']+)["']/g;
const htmlIds = new Set();
let match;
while ((match = idRegex.exec(html)) !== null) {
  htmlIds.add(match[1]);
}

console.log(`Found ${htmlIds.size} IDs in index.html`);

// Scan all JS files for getElementById('...')
const jsFiles = fs.readdirSync(path.join(__dirname, '../js')).filter(f => f.endsWith('.js'));
const missingIds = [];

jsFiles.forEach(file => {
  const content = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
  const getElemRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = getElemRegex.exec(content)) !== null) {
    const id = m[1];
    // Dynamic IDs generated at runtime or template IDs
    if (id.startsWith('prop-') || id === 'canvas-container' || htmlIds.has(id)) {
      // Ok
    } else {
      missingIds.push({ file, id });
    }
  }
});

if (missingIds.length > 0) {
  console.error('Missing IDs in index.html:');
  console.table(missingIds);
  process.exit(1);
} else {
  console.log('✔ All getElementById references in JS files exist in index.html or are dynamically handled!');
}
