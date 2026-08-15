(function exposeDiscoveryConfig(root, factory) {
  const config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  root.WanderQuestDiscovery = config;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDiscoveryConfig() {
  const CATEGORY_CONFIG = {
    historic:{label:'Historic places',query:['heritage','building.historic'],vibes:['history']},
    sights:{label:'Landmarks & sights',query:['tourism.sights'],vibes:['history','curious']},
    religious:{label:'Religious heritage',query:['religion'],vibes:['history','curious']},
    museums:{label:'Museums',query:['entertainment.museum'],vibes:['art']},
    culture:{label:'Culture venues',query:['entertainment.culture'],vibes:['art','curious']},
    artwork:{label:'Public art',query:['tourism.attraction.artwork'],vibes:['art']},
    creative:{label:'Creative & maker spaces',query:['production.pottery','commercial.hobby.art','commercial.hobby.sewing_and_knitting','entertainment.culture.arts_centre'],vibes:['art','curious']},
    activities:{label:'Activities & clubs',query:['activity','entertainment.activity_park','entertainment.amusement_arcade','entertainment.bowling_alley','entertainment.escape_game','entertainment.miniature_golf'],vibes:['curious']},
    markets:{label:'Markets & local makers',query:['commercial.marketplace','commercial.art','commercial.gift_and_souvenir'],vibes:['art','curious']},
    attractions:{label:'Local attractions',query:['tourism.attraction'],vibes:['curious']},
    nature:{label:'Natural places',query:['natural'],vibes:['wild']},
    parks:{label:'Parks & gardens',query:['leisure.park'],vibes:['wild']},
    reserves:{label:'Nature reserves',query:['leisure.park.nature_reserve'],vibes:['wild']},
    viewpoints:{label:'Viewpoints',query:['tourism.attraction.viewpoint'],vibes:['wild','curious']},
    cafes:{label:'Cafés',query:['catering.cafe'],vibes:['food']},
    restaurants:{label:'Restaurants',query:['catering.restaurant'],vibes:['food']},
    pubs:{label:'Pubs',query:['catering.pub'],vibes:['food']}
  };

  const VIBE_CONFIG = {
    history:{label:'TIME TRAVELER',defaultCategories:['historic','sights']},
    art:{label:'CONCRETE CANVAS',defaultCategories:['museums','artwork','creative']},
    curious:{label:'CURIOUS',defaultCategories:['attractions','sights','activities','markets']},
    wild:{label:'WILD CARD',defaultCategories:['parks','viewpoints']},
    food:{label:'TASTE TRAIL',defaultCategories:['cafes','restaurants','pubs']}
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

  function allCategoryIds() {
    return Object.keys(CATEGORY_CONFIG);
  }

  function categoryIdsForVibes(vibes, includeAll = false) {
    if (includeAll) return allCategoryIds();
    return Object.entries(CATEGORY_CONFIG)
      .filter(([, config]) => config.vibes.some(vibe => vibes.includes(vibe)))
      .map(([id]) => id);
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
    if (/heritage|historic|monument|religion|memorial/.test(value)) return 'history';
    return 'curious';
  }

  return {CATEGORY_CONFIG,VIBE_CONFIG,DISCOVERY_FILTERS,allCategoryIds,categoryIdsForVibes,queryTokensForCategoryIds,categoryGroupFromCategories};
}));
