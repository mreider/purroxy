#!/usr/bin/env node
// Generates index.json from all sites/*/site.json files in the purroxy-sites repo.
// Run from the root of the purroxy-sites repo.

const fs = require('fs');
const path = require('path');

const sitesDir = path.join(process.cwd(), 'sites');
const outputFile = path.join(process.cwd(), 'index.json');

if (!fs.existsSync(sitesDir)) {
  console.log('No sites/ directory found. Creating empty index.');
  fs.writeFileSync(outputFile, JSON.stringify({ sites: [], generatedAt: new Date().toISOString() }, null, 2));
  process.exit(0);
}

const slugs = fs.readdirSync(sitesDir).filter(name => {
  const siteJson = path.join(sitesDir, name, 'site.json');
  return fs.existsSync(siteJson);
});

const sites = slugs.map(slug => {
  const siteJson = JSON.parse(fs.readFileSync(path.join(sitesDir, slug, 'site.json'), 'utf-8'));
  return {
    slug,
    name: siteJson.name || slug,
    description: siteJson.description || '',
    siteUrl: siteJson.siteUrl || '',
    author: siteJson.author || 'Unknown',
    capabilities: siteJson.capabilities || [],
    submissionId: siteJson.submissionId || null,
  };
});

const index = {
  sites: sites.sort((a, b) => a.name.localeCompare(b.name)),
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(outputFile, JSON.stringify(index, null, 2));
console.log(`Generated index.json with ${sites.length} site(s).`);
