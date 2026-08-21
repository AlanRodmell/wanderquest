(function exposeDiscoveryConfig(root, factory) {
  const config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  root.WanderQuestDiscovery = config;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDiscoveryConfig() {
  const CATEGORY_CONFIG = {
    historic:{label:'Historic places',query:['heritage','building.historic']},
    sights:{label:'Landmarks & sights',query:['tourism.sights','man_made.tower','man_made.lighthouse','man_made.windmill','man_made.watermill']},
    religious:{label:'Religious heritage',query:['religion']},
    museums:{label:'Museums',query:['entertainment.museum']},
    culture:{label:'Culture venues',query:['entertainment.culture']},
    artwork:{label:'Public art',query:['tourism.attraction.artwork']},
    creative:{label:'Creative & maker spaces',query:['production.pottery','commercial.hobby.art','commercial.hobby.sewing_and_knitting','entertainment.culture.arts_centre']},
    producers:{label:'Wineries & local producers',query:['production.winery','production.brewery','production.distillery']},
    activities:{label:'Activities & clubs',query:['activity','entertainment.activity_park','entertainment.amusement_arcade','entertainment.bowling_alley','entertainment.escape_game','entertainment.miniature_golf']},
    markets:{label:'Markets & local makers',query:['commercial.marketplace','commercial.art','commercial.gift_and_souvenir']},
    attractions:{label:'Local attractions',query:['tourism.attraction']},
    nature:{label:'Natural places',query:['natural']},
    parks:{label:'Parks & gardens',query:['leisure.park']},
    reserves:{label:'Nature reserves',query:['leisure.park.nature_reserve']},
    viewpoints:{label:'Viewpoints',query:['tourism.attraction.viewpoint']},
    cafes:{label:'Cafés',query:['catering.cafe']},
    restaurants:{label:'Restaurants',query:['catering.restaurant']},
    pubs:{label:'Pubs',query:['catering.pub']}
  };

  const DISCOVERY_FILTERS = [
    ['all','All'],
    ['activity','Activities'],
    ['food','Food & drink'],
    ['history','History'],
    ['art','Art & culture'],
    ['nature','Nature'],
    ['curious','Curiosities']
  ];

  const IMMEDIATE_POI_RADIUS = 25;
  const GEOAPIFY_CATEGORY_ROOTS = [
    'accommodation','activity','adult','administrative','airport','amenity','beach','building','camping',
    'catering','childcare','commercial','education','emergency','entertainment','healthcare','heritage',
    'highway','leisure','low_emission_zone','man_made','maritime','memorial','national_park','natural',
    'office','parking','pet','political','populated_place','postal_code','power','production',
    'public_transport','railway','religion','rental','service','ski','sport','tourism','waterway'
  ];

  // Endless searches destinations, not every mapped feature. Broad roots that
  // include residences, streets, boundaries and infrastructure are deliberately
  // excluded or replaced with useful child categories.
  const ENDLESS_POI_CATEGORY_BATCHES = [
    [
      'activity','beach','camping','entertainment','heritage','leisure','man_made',
      'maritime','memorial','national_park','natural','religion','ski','sport',
      'tourism','waterway','building.historic'
    ],
    [
      'accommodation.chalet','accommodation.guest_house','accommodation.hostel',
      'accommodation.hotel','accommodation.hut','accommodation.motel','catering',
      'commercial.antiques','commercial.art',
      'commercial.books','commercial.food_and_drink','commercial.gift_and_souvenir',
      'commercial.hobby','commercial.marketplace','commercial.second_hand',
      'production.beekeeper','production.brewery','production.cheese',
      'production.distillery','production.pottery','production.winery'
    ],
    [
      'education.library','education.college','education.university',
      'public_transport.train','service.post.office'
    ]
  ];
  const ENDLESS_POI_QUERY_TOKENS = ENDLESS_POI_CATEGORY_BATCHES.flat();

  function normalizedPlaceName(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function metresBetween(a, b) {
    const toRadians = value => value * Math.PI / 180;
    const lat1 = toRadians(Number(a.lat));
    const lat2 = toRadians(Number(b.lat));
    const deltaLat = lat2 - lat1;
    const deltaLon = toRadians(Number(b.lon) - Number(a.lon));
    const h = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function deduplicatePlaces(places = [], nearbyMetres = 75) {
    const byId = new Set();
    const byName = new Map();
    const unique = [];
    const distanceValue = place => Number.isFinite(Number(place?.dist)) ? Number(place.dist) : Infinity;
    const ordered = [...places].sort((a, b) => distanceValue(a) - distanceValue(b));

    ordered.forEach(place => {
      if (place.origId && byId.has(place.origId)) return;
      const name = normalizedPlaceName(place.name);
      const matches = name ? (byName.get(name) || []) : [];
      if (matches.some(existing => metresBetween(existing, place) <= nearbyMetres)) return;
      if (place.origId) byId.add(place.origId);
      if (name) byName.set(name, [...matches, place]);
      unique.push(place);
    });
    return unique;
  }

  function effectiveCandidateRadius(mode, requestedRadius, discoveryRange) {
    const requested = Math.max(1, Number(requestedRadius) || 1);
    if (mode !== 'just_walk') return requested;
    return Math.max(requested, Math.max(1, Number(discoveryRange) || 1));
  }

  function collectSuccessfulPlaceSearches(settledResults = []) {
    const places = [];
    const errors = [];
    let successCount = 0;
    settledResults.forEach(result => {
      if (result?.status === 'fulfilled' && Array.isArray(result.value)) {
        successCount++;
        places.push(...result.value);
      } else if (result?.status === 'rejected') {
        errors.push(result.reason);
      }
    });
    return {places, errors, successCount};
  }

  function serendipityProfile(value = 50) {
    const level = Math.min(100, Math.max(0, Number(value) || 0));
    const adventurousness = level / 100;
    const label = level < 20 ? 'Familiar'
      : level < 40 ? 'Gentle'
        : level < 60 ? 'Balanced'
          : level < 80 ? 'Adventurous'
            : 'Wild card';
    return {
      level,
      label,
      proximityWeight:2.8 * (1 - adventurousness),
      unusualWeight:2.6 * adventurousness,
      randomWeight:.35 + adventurousness * 1.8,
      surprisePool:Math.round(3 + adventurousness * 17)
    };
  }

  function serendipityScore(place, distanceMetres, value = 50, randomValue = Math.random()) {
    const profile = serendipityProfile(value);
    const distance = Math.max(0, Number(distanceMetres) || 0);
    const proximity = 1 - Math.min(1, distance / 5000);
    const group = categoryGroupFromCategories(place?.categories || []);
    let score = proximity * profile.proximityWeight + randomValue * profile.randomWeight;
    if (group === 'curious') score += profile.unusualWeight * 1.35;
    else if (['art','history','nature','activity'].includes(group)) score += profile.unusualWeight * .45;
    if (place?.tags?.wikipedia) score += 1.2 - (profile.level / 100) * .35;
    if (place?.name && place.name !== 'Local Discovery') score += .65;
    return score;
  }

  function isEndlessDestination(categories = []) {
    const linearWater = categories.some(category => [
      'natural.water.river_system',
      'waterway.channels',
      'waterway.river_system'
    ].includes(category));
    if (!linearWater) return true;

    // Keep a river-adjacent feature when it is also independently classified
    // as a visitable place, but reject raw line-segment records for the waterway.
    return categories.some(category => /^(accommodation|activity|beach|building\.historic|camping|catering|commercial|education|entertainment|heritage|leisure|man_made|maritime|memorial|national_park|production|religion|service\.post\.office|ski|sport|tourism)(\.|$)/.test(category));
  }

  function allCategoryIds() {
    return Object.keys(CATEGORY_CONFIG);
  }

  function queryTokensForCategoryIds(categoryIds) {
    return [...new Set(categoryIds.flatMap(id => CATEGORY_CONFIG[id]?.query || []))];
  }

  function categoryGroupFromCategories(categories = []) {
    const value = categories.join(' ');
    if (/(^|\s)(activity|sport)(?:\.|\s|$)|production\.pottery|commercial\.hobby|entertainment\.(activity_park|amusement_arcade|bowling_alley|escape_game|miniature_golf)/.test(value)) return 'activity';
    if (/catering\.|commercial\.food_and_drink|restaurant|cafe|pub/.test(value)) return 'food';
    if (/natural|national_park|beach|waterway|leisure\.park|viewpoint|garden/.test(value)) return 'nature';
    if (/artwork|museum|culture|gallery|commercial\.art/.test(value)) return 'art';
    if (/heritage|historic|monument|religion|memorial|man_made\.(tower|lighthouse|windmill|watermill)/.test(value)) return 'history';
    return 'curious';
  }

  return {
    CATEGORY_CONFIG,
    DISCOVERY_FILTERS,
    IMMEDIATE_POI_RADIUS,
    GEOAPIFY_CATEGORY_ROOTS,
    ENDLESS_POI_CATEGORY_BATCHES,
    ENDLESS_POI_QUERY_TOKENS,
    deduplicatePlaces,
    effectiveCandidateRadius,
    collectSuccessfulPlaceSearches,
    serendipityProfile,
    serendipityScore,
    isEndlessDestination,
    allCategoryIds,
    queryTokensForCategoryIds,
    categoryGroupFromCategories
  };
}));
