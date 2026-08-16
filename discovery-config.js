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
    ['education.library','education.college','education.university','service.post.office']
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
    const ordered = [...places].sort((a, b) => (Number(a.dist) || Infinity) - (Number(b.dist) || Infinity));

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
    isEndlessDestination,
    allCategoryIds,
    queryTokensForCategoryIds,
    categoryGroupFromCategories
  };
}));
