const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {CATEGORY_CONFIG,allCategoryIds,queryTokensForCategoryIds,categoryGroupFromCategories} = require('../discovery-config.js');

test('discovery can search every category without a personality filter', () => {
  assert.ok(allCategoryIds().length > 0);
  assert.ok(queryTokensForCategoryIds(allCategoryIds()).includes('production.pottery'));
});

test('creative and activity venues include pottery and hands-on places', () => {
  assert.ok(CATEGORY_CONFIG.creative.query.includes('production.pottery'));
  assert.ok(CATEGORY_CONFIG.activities.query.includes('activity'));
  assert.equal(categoryGroupFromCategories(['catering.cafe','production.pottery']), 'activity');
  assert.equal(categoryGroupFromCategories(['activity']), 'activity');
  assert.equal(categoryGroupFromCategories(['entertainment.escape_game']), 'activity');
});

test('Mystery Walk has no vibe setup or runtime dependency', () => {
  const root = path.join(__dirname, '..');
  const sources = ['index.html','app.js','discovery-config.js','styles.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /vibes?/i);
  assert.match(sources, /mystery:\['Choose your journey','Refine destinations','Duration & launch'\]/);
});
