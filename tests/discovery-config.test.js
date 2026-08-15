const test = require('node:test');
const assert = require('node:assert/strict');
const {CATEGORY_CONFIG,allCategoryIds,categoryIdsForVibes,queryTokensForCategoryIds,categoryGroupFromCategories} = require('../discovery-config.js');

test('Endless discovery can start without a vibe and search every category', () => {
  assert.deepEqual(categoryIdsForVibes([], true), allCategoryIds());
  assert.ok(categoryIdsForVibes([], true).length > categoryIdsForVibes(['history']).length);
  assert.ok(queryTokensForCategoryIds(categoryIdsForVibes([], true)).includes('production.pottery'));
});

test('creative and activity venues include pottery and hands-on places', () => {
  assert.ok(CATEGORY_CONFIG.creative.query.includes('production.pottery'));
  assert.ok(CATEGORY_CONFIG.activities.query.includes('activity'));
  assert.equal(categoryGroupFromCategories(['catering.cafe','production.pottery']), 'activity');
  assert.equal(categoryGroupFromCategories(['activity']), 'activity');
  assert.equal(categoryGroupFromCategories(['entertainment.escape_game']), 'activity');
});
