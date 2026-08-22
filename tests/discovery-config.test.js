const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CATEGORY_CONFIG,
  IMMEDIATE_POI_RADIUS,
  GEOAPIFY_CATEGORY_ROOTS,
  ENDLESS_POI_CATEGORY_BATCHES,
  ENDLESS_POI_QUERY_TOKENS,
  deduplicatePlaces,
  placeKey,
  completedPlaceKeys,
  excludeCompletedPlaces,
  effectiveCandidateRadius,
  collectSuccessfulPlaceSearches,
  serendipityProfile,
  serendipityScore,
  isEndlessDestination,
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
  assert.ok(ENDLESS_POI_QUERY_TOKENS.includes('production.winery'));
});

test('landmark discovery includes towers and other notable structures', () => {
  assert.ok(CATEGORY_CONFIG.sights.query.includes('man_made.tower'));
  assert.ok(ENDLESS_POI_QUERY_TOKENS.includes('man_made'));
  assert.equal(categoryGroupFromCategories(['man_made.tower']), 'history');
});

test('category catalogue tracks every Geoapify top-level Places category', () => {
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

test('Endless excludes residences, streets, boundaries and infrastructure', () => {
  const excluded = [
    'adult','administrative','airport','amenity','building','childcare','emergency',
    'healthcare','highway','low_emission_zone','office','parking','pet','political',
    'populated_place','postal_code','power','public_transport','railway','rental','service'
  ];
  excluded.forEach(category => assert.ok(!ENDLESS_POI_QUERY_TOKENS.includes(category), category));
  assert.ok(ENDLESS_POI_QUERY_TOKENS.includes('building.historic'));
  assert.ok(ENDLESS_POI_QUERY_TOKENS.includes('education.library'));
  assert.ok(ENDLESS_POI_QUERY_TOKENS.includes('public_transport.train'));
  assert.ok(ENDLESS_POI_QUERY_TOKENS.includes('service.post.office'));
  assert.ok(!ENDLESS_POI_QUERY_TOKENS.includes('accommodation'));
  assert.ok(!ENDLESS_POI_QUERY_TOKENS.includes('accommodation.apartment'));
  assert.ok(ENDLESS_POI_QUERY_TOKENS.includes('accommodation.hotel'));
  assert.equal(new Set(ENDLESS_POI_QUERY_TOKENS).size, ENDLESS_POI_QUERY_TOKENS.length);
});

test('duplicate provider records collapse by name and nearby coordinates', () => {
  const places = [
    {name:"St Aidan's Winery",lat:55.00000,lon:-1.80000,origId:'poi',dist:20},
    {name:'St Aidans Winery',lat:55.00008,lon:-1.80005,origId:'building',dist:21},
    {name:"St Aidan's Winery",lat:55.01000,lon:-1.80000,origId:'other-branch',dist:1200},
    {name:'Osborne Tower',lat:55.00100,lon:-1.80100,origId:'tower',dist:130}
  ];
  const unique = deduplicatePlaces(places);
  assert.deepEqual(unique.map(place => place.origId), ['poi','tower','other-branch']);
});

test('deduplication preserves a destination at the current position', () => {
  const unique = deduplicatePlaces([
    {name:'Clock Tower',lat:55,lon:-1.8,origId:'at-user',dist:0},
    {name:'Clock Tower',lat:55.00005,lon:-1.8,origId:'nearby-copy',dist:8}
  ]);
  assert.deepEqual(unique.map(place => place.origId), ['at-user']);
});

test('completed discoveries are excluded but Give Up reveals remain eligible', () => {
  const completed = {name:'Old Mill',origId:'old-mill',givenUp:false};
  const legacyCompleted = {name:'Clock Tower',lat:55.00001,lon:-1.80001};
  const revealed = {name:'Hidden Garden',origId:'hidden-garden',givenUp:true};
  const newPlace = {name:'New Place',origId:'new-place'};
  const journal = [completed, legacyCompleted, revealed];
  const candidates = [
    {...completed},
    {...legacyCompleted},
    {...revealed},
    newPlace
  ];

  assert.deepEqual([...completedPlaceKeys(journal)], [
    'old-mill',
    placeKey(legacyCompleted)
  ]);
  assert.deepEqual(
    excludeCompletedPlaces(candidates, journal).map(placeKey),
    ['hidden-garden','new-place']
  );
});

test('completed discovery filtering uses stable provider, coordinate and name keys', () => {
  assert.equal(placeKey({origId:'provider-id',name:'Ignored'}), 'provider-id');
  assert.equal(placeKey({lat:55.123456,lon:-1.987654}), '55.12346,-1.98765');
  assert.equal(placeKey({name:'Local Landmark'}), 'local landmark');
});

test('Endless fetches at least the range advertised by its browser', () => {
  assert.equal(effectiveCandidateRadius('just_walk', 1500, 2000), 2000);
  assert.equal(effectiveCandidateRadius('just_walk', 5000, 2000), 5000);
  assert.equal(effectiveCandidateRadius('mystery', 1500, 5000), 1500);
});

test('partial place-search failures keep successful result batches', () => {
  const failure = new Error('rate limited');
  const collected = collectSuccessfulPlaceSearches([
    {status:'fulfilled',value:[{name:'Museum'}]},
    {status:'rejected',reason:failure},
    {status:'fulfilled',value:[{name:'Park'},{name:'Cafe'}]}
  ]);
  assert.deepEqual(collected.places.map(place => place.name), ['Museum','Park','Cafe']);
  assert.deepEqual(collected.errors, [failure]);
  assert.equal(collected.successCount, 2);
});

test('Serendipity Dial moves selection from nearby to unusual places', () => {
  const nearby = {name:'Corner Cafe',categories:['catering.cafe']};
  const unusual = {name:'Hidden Curiosity',categories:['commercial.antiques']};
  assert.ok(serendipityScore(nearby,100,10,.5)>serendipityScore(unusual,5000,10,.5));
  assert.ok(serendipityScore(unusual,5000,90,.5)>serendipityScore(nearby,100,90,.5));
  assert.equal(serendipityProfile(50).label,'Balanced');
  assert.ok(serendipityProfile(90).surprisePool>serendipityProfile(10).surprisePool);
});

test('raw river-system line segments are not Endless destinations', () => {
  assert.equal(isEndlessDestination(['natural.water.river_system','waterway','waterway.river_system']), false);
  assert.equal(isEndlessDestination(['natural.water.river_system','tourism.attraction']), true);
  assert.equal(isEndlessDestination(['natural.mountain.peak']), true);
});

test('Endless discovery defaults to nearest and does not exclude close candidates', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(source, /discoverySort: 'nearest'/);
  assert.match(source, /ENDLESS_POI_CATEGORY_BATCHES\.map/);
  assert.match(source, /Promise\.allSettled\(searches\)/);
  assert.match(source, /effectiveCandidateRadius\(S\.mode,radius,S\.discoveryRange\)/);
  assert.match(source, /S\.mode==='just_walk'&&!pool\.length/);
  assert.match(source, /queryTokens: queryTokensForCategoryIds\(allCategoryIds\(\)\)/);
  assert.match(source, /namedOnly: true/);
  assert.match(source, /if \(namedOnly && !explicitName\) return null/);
  assert.match(source, /S\.candidates = deduplicatePlaces/);
  assert.match(source, /!isEndlessDestination\(props\.categories/);
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
