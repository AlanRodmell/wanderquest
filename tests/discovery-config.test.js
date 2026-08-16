const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CATEGORY_CONFIG,
  IMMEDIATE_POI_RADIUS,
  GEOAPIFY_CATEGORY_BATCHES,
  GEOAPIFY_CATEGORY_ROOTS,
  allCategoryIds,
  queryTokensForCategoryIds,
  categoryGroupFromCategories
} = require('../discovery-config.js');

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

test('nearby discovery includes wineries and protects immediate POIs', () => {
  assert.ok(CATEGORY_CONFIG.producers.query.includes('production.winery'));
  assert.ok(queryTokensForCategoryIds(allCategoryIds()).includes('production.winery'));
  assert.equal(IMMEDIATE_POI_RADIUS, 25);
  assert.ok(GEOAPIFY_CATEGORY_ROOTS.includes('production'));
});

test('landmark discovery includes towers and other notable structures', () => {
  assert.ok(CATEGORY_CONFIG.sights.query.includes('man_made.tower'));
  assert.ok(GEOAPIFY_CATEGORY_ROOTS.includes('man_made'));
  assert.equal(categoryGroupFromCategories(['man_made.tower']), 'history');
});

test('Endless discovery supports every Geoapify top-level Places category', () => {
  const expectedRoots = [
    'accommodation','activity','adult','administrative','airport','amenity','beach','building','camping',
    'catering','childcare','commercial','education','emergency','entertainment','healthcare','heritage',
    'highway','leisure','low_emission_zone','man_made','maritime','memorial','national_park','natural',
    'office','parking','pet','political','populated_place','postal_code','power','production',
    'public_transport','railway','religion','rental','service','ski','sport','tourism','waterway'
  ];
  assert.deepEqual([...GEOAPIFY_CATEGORY_ROOTS].sort(), expectedRoots.sort());
  assert.equal(new Set(GEOAPIFY_CATEGORY_ROOTS).size, GEOAPIFY_CATEGORY_ROOTS.length);
});

test('locality categories cannot monopolise the POI response batch', () => {
  const populatedBatch = GEOAPIFY_CATEGORY_BATCHES.find(batch => batch.includes('populated_place'));
  const tourismBatch = GEOAPIFY_CATEGORY_BATCHES.find(batch => batch.includes('tourism'));
  assert.ok(populatedBatch);
  assert.ok(tourismBatch);
  assert.notEqual(populatedBatch, tourismBatch);
  assert.deepEqual(populatedBatch, ['administrative','low_emission_zone','political','populated_place','postal_code']);
});

test('Endless discovery defaults to nearest and does not exclude close candidates', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(source, /discoverySort: 'nearest'/);
  assert.match(source, /GEOAPIFY_CATEGORY_BATCHES\.map/);
  assert.match(source, /namedOnly: true/);
  assert.match(source, /conditions=named/);
  assert.match(source, /geoapifySearch\(S\.user, IMMEDIATE_POI_RADIUS/);
  assert.match(source, /S\.mode !== 'just_walk' && S\.terrain === 'paved'/);
  assert.match(source, /S\.mode === 'just_walk' \|\| x\.dist >= min/);
  assert.match(source, /place\.dist <= IMMEDIATE_POI_RADIUS \|\| S\.discoveryFilter/);
  assert.match(source, /bias=proximity:/);
  assert.match(source, /lat:54\.955014,lon:-1\.880329/);
});

test('Mystery Walk has no vibe setup or runtime dependency', () => {
  const root = path.join(__dirname, '..');
  const sources = ['index.html','app.js','discovery-config.js','styles.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /vibes?/i);
  assert.match(sources, /mystery:\['Choose your journey','Refine destinations','Duration & launch'\]/);
});
