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
  // Keep locality and boundary records from crowding POIs out of Geoapify's
  // capped response. Each batch is proximity-biased and merged client-side.
  const GEOAPIFY_CATEGORY_BATCHES = [
    [
      'accommodation','activity','adult','amenity','beach','camping','catering',
      'commercial','education','entertainment','heritage','leisure','man_made',
      'maritime','memorial','national_park','natural','pet','production',
      'religion','rental','service','ski','sport','tourism','waterway'
    ],
    [
      'airport','childcare','emergency','healthcare','office','parking',
      'public_transport','railway'
    ],
    ['building','highway','power'],
    ['administrative','low_emission_zone','political','populated_place','postal_code']
  ];
  const GEOAPIFY_CATEGORY_ROOTS = GEOAPIFY_CATEGORY_BATCHES.flat();

  function allCategoryIds() {
    return Object.keys(CATEGORY_CONFIG);
  }

  function queryTokensForCategoryIds(categoryIds) {
    return [...new Set(categoryIds.flatMap(id => CATEGORY_CONFIG[id]?.query || []))];
  }

  function categoryGroupFromCategories(categories = []) {
    const value = categories.join(' ');
    if (/(^|\s)activity(?:\.|\s|$)|production\.pottery|commercial\.hobby|entertainment\.(activity_park|amusement_arcade|bowling_alley|escape_game|miniature_golf)/.test(value)) return 'activity';
    if (/catering\.|restaurant|cafe|pub/.test(value)) return 'food';
    if (/natural|leisure\.park|viewpoint|garden/.test(value)) return 'nature';
    if (/artwork|museum|culture|gallery|commercial\.art/.test(value)) return 'art';
    if (/heritage|historic|monument|religion|memorial|man_made\.(tower|lighthouse|windmill|watermill)/.test(value)) return 'history';
    return 'curious';
  }

  return {
    CATEGORY_CONFIG,
    DISCOVERY_FILTERS,
    IMMEDIATE_POI_RADIUS,
    GEOAPIFY_CATEGORY_BATCHES,
    GEOAPIFY_CATEGORY_ROOTS,
    allCategoryIds,
    queryTokensForCategoryIds,
    categoryGroupFromCategories
  };
}));
