const CATEGORY_CONFIG = {
  historic:{label:'Historic places',query:['heritage','building.historic'],vibes:['history']},
  sights:{label:'Landmarks & sights',query:['tourism.sights'],vibes:['history','curious']},
  religious:{label:'Religious heritage',query:['religion'],vibes:['history','curious']},
  museums:{label:'Museums',query:['entertainment.museum'],vibes:['art']},
  culture:{label:'Culture venues',query:['entertainment.culture'],vibes:['art','curious']},
  artwork:{label:'Public art',query:['tourism.attraction.artwork'],vibes:['art']},
  attractions:{label:'Local attractions',query:['tourism.attraction'],vibes:['curious']},
  nature:{label:'Natural places',query:['natural'],vibes:['wild']},
  parks:{label:'Parks & gardens',query:['leisure.park'],vibes:['wild']},
  reserves:{label:'Nature reserves',query:['leisure.park.nature_reserve'],vibes:['wild']},
  viewpoints:{label:'Viewpoints',query:['tourism.attraction.viewpoint'],vibes:['wild','curious']},
  cafes:{label:'Cafés',query:['catering.cafe'],vibes:['food']},
  restaurants:{label:'Restaurants',query:['catering.restaurant'],vibes:['food']},
  pubs:{label:'Pubs',query:['catering.pub'],vibes:['food']}
};

const VIBE_CONFIG={
  history:{label:'TIME TRAVELER',defaultCategories:['historic','sights']},
  art:{label:'CONCRETE CANVAS',defaultCategories:['museums','artwork']},
  curious:{label:'CURIOUS',defaultCategories:['attractions','sights']},
  wild:{label:'WILD CARD',defaultCategories:['parks','viewpoints']},
  food:{label:'TASTE TRAIL',defaultCategories:['cafes','restaurants','pubs']}
};

const STORAGE_KEYS = {
  apiKey: 'wq_geoapify_key',
  history: 'wq_history',
  activeQuest: 'wq_active_quest',
  accentColor: 'wq_accent_color',
  routeColor: 'wq_route_color',
  preferences: 'wq_preferences'
};
const DEFAULT_COLORS = {accent:'#d7ff4f',route:'#ff4f87'};
const ACTIVE_QUEST_MAX_AGE = 12 * 60 * 60 * 1000;
const WALKING_METRES_PER_MINUTE = 75;
const ROUTE_DISTANCE_FACTOR = 1.25;

const discoveryPrompts = [
  "Look closely at the architecture. What specific details stand out?",
  "Take a moment to read any plaques, signs, or inscriptions nearby.",
  "Look for traces of how this place has changed over time.",
  "What is the most easily overlooked detail here?",
  "Observe the texture of the materials around you.",
  "What vibes or historical weight does this corner hold?",
  "Try to find a marker, date, or name carved somewhere nearby."
];

const VIBE_PROMPTS = {
  history:["Find the oldest visible date or material here.","What clue best reveals how this place was once used?"],
  art:["Choose one colour, shape or detail you would borrow from this place.","What changes when you view this place from another angle?"],
  curious:["Find the detail that raises the best unanswered question.","What would you point out to someone who walked straight past?"],
  wild:["Pause for one minute and notice the nearest non-human activity.","Find three different textures or natural patterns nearby."],
  food:["What detail gives this venue its local character?", "Look for a speciality, ingredient or tradition unique to this stop."]
};

function getRandomPrompt() {
  const tailored = S.vibes.flatMap(vibe => VIBE_PROMPTS[vibe] || []);
  const prompts = tailored.length ? [...tailored,...discoveryPrompts] : discoveryPrompts;
  return prompts[Math.floor(Math.random() * prompts.length)];
}

const S = {
  mode: 'mystery',
  vibes: ['history'],
  selectedCategories: ['historic','sights'],
  minutes: 60,
  terrain: 'paved',
  map: null,
  user: null,
  startLoc: null,
  target: null,
  targetMarker: null,
  userMarker: null,
  stop: 1,
  maxStops: 5,
  startedAt: 0,
  discovered: [],
  journal: [],
  used: new Set(),
  candidates: [],
  candidatesOrigin: null,
  rangeMultiplier: 1,
  poolIndex: 0,
  revealToken: 0,
  viewingHistoryIdx: -1,
  mapRotationEnabled: false,
  deviceHeading: 0,
  headingListener: null,
  locationWatchId: null,
  phase: 'home',
  questId: null,
  deadline: 0,
  routeMinutes: null,
  discoverySort: 'recommended',
  discoveryFilter: 'all',
  discoveryRange: 2000,
  discoveryLimit: 8,
  installPrompt: null
};

let busy = false; let DEV_MODE = false; let DEV_LOCATION = {lat:53.4084,lon:-2.9916,accuracy:25};
function guarded(fn){return async(...a)=>{if(busy)return;busy=true;try{await fn(...a)}finally{busy=false}}}
const $ = id => document.getElementById(id);

function validHexColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback;
}

function appearanceColors() {
  return {
    accent: validHexColor(localStorage.getItem(STORAGE_KEYS.accentColor), DEFAULT_COLORS.accent),
    route: validHexColor(localStorage.getItem(STORAGE_KEYS.routeColor), DEFAULT_COLORS.route)
  };
}

function applyAppearance(colors = appearanceColors(), persist = false) {
  const accent = validHexColor(colors.accent, DEFAULT_COLORS.accent);
  const route = validHexColor(colors.route, DEFAULT_COLORS.route);
  document.documentElement.style.setProperty('--acid', accent);
  document.documentElement.style.setProperty('--route', route);
  $('accentColorInput').value = accent;
  $('routeColorInput').value = route;
  if (persist) {
    localStorage.setItem(STORAGE_KEYS.accentColor, accent);
    localStorage.setItem(STORAGE_KEYS.routeColor, route);
  }
  if (S.map && routeLayer) routeLayer.setStyle({color: route});
  if (S.map && S.target) targetMarker(S.target);
}

applyAppearance();
$('accentColorInput').oninput = event => applyAppearance({...appearanceColors(), accent:event.target.value}, true);
$('routeColorInput').oninput = event => applyAppearance({...appearanceColors(), route:event.target.value}, true);
$('resetColorsBtn').onclick = () => {
  localStorage.removeItem(STORAGE_KEYS.accentColor);
  localStorage.removeItem(STORAGE_KEYS.routeColor);
  applyAppearance(DEFAULT_COLORS);
  toast('Default colours restored');
};

// Settings & API Key Setup
const savedKey = localStorage.getItem(STORAGE_KEYS.apiKey);
if (savedKey) $('apiKeyInput').value = savedKey;

$('settingsToggle').onclick = () => { $('settingsPanel').classList.toggle('hidden'); };
$('settingsClose').onclick = () => { $('settingsPanel').classList.add('hidden'); };
$('saveKeyBtn').onclick = async () => {
  const key = $('apiKeyInput').value.trim();
  const status = $('apiKeyStatus');
  if (!key) {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    status.textContent = 'Enter an API key to continue.';
    status.className = 'api-status error';
    return;
  }

  $('saveKeyBtn').disabled = true;
  status.textContent = 'Testing key…';
  status.className = 'api-status';
  try {
    await validateApiKey(key);
    localStorage.setItem(STORAGE_KEYS.apiKey, key);
    status.textContent = 'Key verified and saved on this device.';
    status.className = 'api-status success';
    toast('API key verified');
  } catch (error) {
    status.textContent = error.message;
    status.className = 'api-status error';
  } finally {
    $('saveKeyBtn').disabled = false;
  }
};

async function validateApiKey(key) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10000);
  try {
    const url = `https://api.geoapify.com/v1/geocode/search?text=London&limit=1&apiKey=${encodeURIComponent(key)}`;
    const response = await fetch(url, {signal: ctrl.signal});
    if (response.status === 401 || response.status === 403) throw new Error('That API key was rejected.');
    if (!response.ok) throw new Error(`Geoapify could not verify the key (${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error('Geoapify returned an unexpected response.');
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Key test timed out. Check your connection.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.history);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate the original format without treating previous walks as the
      // current quest. Current-quest state intentionally starts empty.
      if (Array.isArray(parsed.journal)) S.journal = parsed.journal;
      else if (Array.isArray(parsed.discovered)) S.journal = parsed.discovered;
    }
  } catch(e) {}
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify({
      version: 2,
      journal: S.journal
    }));
  } catch(e) {}
}

loadHistory();

function activeQuestSnapshot() {
  return {
    version: 1,
    savedAt: Date.now(),
    mode: S.mode,
    vibes: S.vibes,
    categories: S.selectedCategories,
    minutes: S.minutes,
    terrain: S.terrain,
    startLoc: S.startLoc,
    target: S.target,
    stop: S.stop,
    maxStops: S.maxStops,
    startedAt: S.startedAt,
    deadline: S.deadline,
    discovered: S.discovered,
    used: Array.from(S.used),
    phase: S.phase,
    questId: S.questId
  };
}

function saveActiveQuest() {
  if (!S.startedAt || S.phase === 'home' || S.phase === 'finished') return;
  try { localStorage.setItem(STORAGE_KEYS.activeQuest, JSON.stringify(activeQuestSnapshot())); } catch (error) {}
}

function clearActiveQuest() {
  localStorage.removeItem(STORAGE_KEYS.activeQuest);
}

function loadActiveQuest() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.activeQuest) || 'null');
    if (!saved || !saved.savedAt || Date.now() - saved.savedAt > ACTIVE_QUEST_MAX_AGE) {
      clearActiveQuest();
      return null;
    }
    return saved;
  } catch (error) {
    clearActiveQuest();
    return null;
  }
}

function showResumeOption() {
  const saved = loadActiveQuest();
  if (!saved) return;
  $('resumeTitle').textContent = saved.mode === 'just_walk' ? 'Resume Endless Discovery' : 'Resume Mystery Walk';
  const count = Array.isArray(saved.discovered) ? saved.discovered.length : 0;
  $('resumeMeta').textContent = `${count} ${count === 1 ? 'discovery' : 'discoveries'} · saved ${formatRelativeTime(saved.savedAt)}`;
  $('resumeCard').classList.remove('hidden');
}

function formatRelativeTime(timestamp) {
  const mins = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

showResumeOption();

// Developer Location Logic
function setDevLocation(p,label,buttonId){
 DEV_MODE=true;DEV_LOCATION={...p};stopLocationWatch();
 document.querySelectorAll('#settingsPanel .dev-row button').forEach(b=>b.classList.remove('active'));
 $(buttonId).classList.add('active');$('settingsPanel').classList.add('hidden');toast(`Developer location: ${label}`);
}
$('realLocationBtn').onclick=()=>{DEV_MODE=false;document.querySelectorAll('#settingsPanel .dev-row button').forEach(b=>b.classList.remove('active'));$('realLocationBtn').classList.add('active');if(!$('walk').classList.contains('hidden'))startLocationWatch();toast('Real GPS enabled')};
$('neLocationBtn').onclick=()=>setDevLocation({lat:54.948,lon:-1.921,accuracy:25},'NE43 7DL','neLocationBtn');
$('londonLocationBtn').onclick=()=>setDevLocation({lat:51.5074,lon:-0.1278,accuracy:25},'London','londonLocationBtn');

// Options selection
function selectOption(selector, selected) {
  document.querySelectorAll(selector).forEach(button => {
    const active = button === selected;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function availableCategoryIds() {
  return Object.entries(CATEGORY_CONFIG)
    .filter(([, config]) => config.vibes.some(vibe => S.vibes.includes(vibe)))
    .map(([id]) => id);
}

function defaultCategoryIds() {
  return [...new Set(S.vibes.flatMap(vibe => VIBE_CONFIG[vibe]?.defaultCategories || []))];
}

function selectedQueryTokens() {
  return [...new Set(S.selectedCategories.flatMap(id => CATEGORY_CONFIG[id]?.query || []))];
}

function availableTokensForVibe(vibe) {
  return [...new Set(S.selectedCategories
    .filter(id => CATEGORY_CONFIG[id]?.vibes.includes(vibe))
    .flatMap(id => CATEGORY_CONFIG[id].query))];
}

function selectedVibeLabel() {
  if (S.vibes.length === 1) return VIBE_CONFIG[S.vibes[0]].label;
  return `${S.vibes.length} VIBES`;
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({
      vibes:S.vibes,
      categories:S.selectedCategories,
      minutes:S.minutes,
      terrain:S.terrain
    }));
  } catch (error) {}
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.preferences) || 'null');
    if (!saved) return;
    const vibes = Array.isArray(saved.vibes) ? saved.vibes.filter(vibe => VIBE_CONFIG[vibe]).slice(0,3) : [];
    if (vibes.length) S.vibes = vibes;
    const available = new Set(availableCategoryIds());
    const categories = Array.isArray(saved.categories) ? saved.categories.filter(id => available.has(id)) : [];
    S.selectedCategories = categories.length ? categories : defaultCategoryIds();
    if ([30,60,90,120].includes(Number(saved.minutes))) S.minutes = Number(saved.minutes);
    if (['paved','any'].includes(saved.terrain)) S.terrain = saved.terrain;
    S.maxStops=S.minutes<=30?3:S.minutes<=60?5:S.minutes<=90?7:9;
  } catch (error) {}
}

function renderVibeSelections() {
  document.querySelectorAll('.vibe').forEach(button => {
    const selected = S.vibes.includes(button.dataset.vibe);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('vibeCount').textContent = `${S.vibes.length} / 3`;
}

function renderCategoryFilters() {
  const available = availableCategoryIds();
  S.selectedCategories = S.selectedCategories.filter(id => available.includes(id));
  if (!S.selectedCategories.length) S.selectedCategories = defaultCategoryIds();
  $('categoryFilters').innerHTML = available.map(id => {
    const selected = S.selectedCategories.includes(id);
    return `<button type="button" class="category-filter ${selected?'selected':''}" data-category="${id}" aria-pressed="${selected}">${esc(CATEGORY_CONFIG[id].label)}</button>`;
  }).join('');
  $('categoryCount').textContent = `${S.selectedCategories.length} selected`;
  document.querySelectorAll('[data-category]').forEach(button => button.onclick = () => {
    const id = button.dataset.category;
    if (S.selectedCategories.includes(id)) {
      if (S.selectedCategories.length === 1) return toast('Keep at least one destination category.');
      S.selectedCategories = S.selectedCategories.filter(value => value !== id);
    } else {
      S.selectedCategories.push(id);
    }
    renderCategoryFilters();
    savePreferences();
  });
}

loadPreferences();
renderVibeSelections();
renderCategoryFilters();
document.querySelectorAll('.duration').forEach(button => {
  const selected = Number(button.dataset.min) === S.minutes;
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',String(selected));
  button.onclick=()=>{selectOption('.duration',button);S.minutes=+button.dataset.min;S.maxStops=S.minutes<=30?3:S.minutes<=60?5:S.minutes<=90?7:9;savePreferences()};
});
document.querySelectorAll('.terrain-opts .option').forEach(button => {
  const selected = button.dataset.terrain === S.terrain;
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',String(selected));
  button.onclick=()=>{selectOption('.terrain-opts .option',button);S.terrain=button.dataset.terrain;savePreferences()};
});
document.querySelectorAll('.vibe').forEach(button => button.onclick = () => {
  const vibe = button.dataset.vibe;
  if (S.vibes.includes(vibe)) {
    if (S.vibes.length === 1) return toast('Choose at least one vibe.');
    S.vibes = S.vibes.filter(value => value !== vibe);
    S.selectedCategories = S.selectedCategories.filter(id => CATEGORY_CONFIG[id].vibes.some(value => S.vibes.includes(value)));
  } else {
    if (S.vibes.length >= 3) return toast('Choose up to three vibes.');
    S.vibes.push(vibe);
    S.selectedCategories = [...new Set([...S.selectedCategories,...VIBE_CONFIG[vibe].defaultCategories])];
  }
  renderVibeSelections();
  renderCategoryFilters();
  savePreferences();
});
$('selectAllCategoriesBtn').onclick=()=>{S.selectedCategories=availableCategoryIds();renderCategoryFilters();savePreferences()};
$('resetCategoriesBtn').onclick=()=>{S.selectedCategories=defaultCategoryIds();renderCategoryFilters();savePreferences()};

function toast(m){$('toast').textContent=m;$('toast').classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').classList.add('hidden'),2800)}

window.addEventListener('error',ev=>{if(ev?.message)toast(ev.message)});
window.addEventListener('unhandledrejection',ev=>{toast(ev?.reason?.message||String(ev?.reason||'Something went wrong.'))});

// Geometry & Maths
function bearing(a,b){const p=Math.PI/180,y=Math.sin((b.lon-a.lon)*p)*Math.cos(b.lat*p),x=Math.cos(a.lat*p)*Math.sin(b.lat*p)-Math.sin(a.lat*p)*Math.cos(b.lat*p)*Math.cos((b.lon-a.lon)*p);return(Math.atan2(y,x)*180/Math.PI+360)%360}
function compass(deg){const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return dirs[Math.round(deg/22.5)%16]}
function distLabel(){
  const deg = bearing(S.user,S.target);
  return `${fd(dist(S.user,S.target))} · <span class="compass-icon" style="transform:rotate(${deg}deg)">↑</span> ${compass(deg)}`;
}
function dist(a,b){const R=6371000,p=Math.PI/180,d1=(b.lat-a.lat)*p,d2=(b.lon-a.lon)*p,x=Math.sin(d1/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function fd(m){return m<1000?Math.round(m)+' m away':(m/1000).toFixed(1)+' km away'}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function estimatedWalkMinutes(metres) {
  return Math.max(1, Math.ceil((metres * ROUTE_DISTANCE_FACTOR) / WALKING_METRES_PER_MINUTE));
}

function remainingMinutes() {
  if (S.mode !== 'mystery' || !S.deadline) return Infinity;
  return Math.max(0, Math.ceil((S.deadline - Date.now()) / 60000));
}

function estimatedReturnMinutes(from = S.user) {
  if (!from || !S.startLoc) return 0;
  return estimatedWalkMinutes(dist(from, S.startLoc));
}

function shouldHeadHome() {
  if (S.mode !== 'mystery') return false;
  return S.stop >= S.maxStops || remainingMinutes() <= estimatedReturnMinutes(S.user) + 5;
}

function candidateFitsTimeBudget(candidate) {
  if (S.mode !== 'mystery') return true;
  const outbound = estimatedWalkMinutes(dist(S.user, candidate));
  const returnTrip = estimatedWalkMinutes(dist(candidate, S.startLoc));
  return outbound + returnTrip + 5 <= remainingMinutes();
}

function elapsedLabel() {
  const elapsed = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));
  if (elapsed < 60) return `${elapsed}m`;
  const hours = Math.floor(elapsed / 60);
  const mins = elapsed % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function updateQuestClock() {
  const el = $('timeRemainingText');
  if (!el || S.mode !== 'mystery' || $('walk').classList.contains('hidden')) {
    if (el) el.textContent = '';
    return;
  }
  el.textContent = ` · ${remainingMinutes()}m left`;
}

setInterval(updateQuestClock, 30000);

function blurb(t){
  if (t.categories && t.categories.length) {
    const displayCats = t.categories.slice(0, 2).map(c => c.replace(/\./g, ' '));
    return `Mapped locally as a ${displayCats.join(' and ')} site. The rest is yours to discover.`;
  }
  return 'The map says this place is worth noticing. The rest of the story is yours to discover.';
}
function tags(t){
  if (!t.categories) return [];
  return t.categories.slice(0, 4);
}

async function pos(maxAge=20000){
 if(DEV_MODE)return {...DEV_LOCATION};
 if(navigator.onLine===false)throw new Error('Offline. Reconnect and try again.');
 if(!window.isSecureContext)throw new Error('Location needs a secure (HTTPS) connection.');
 if(!navigator.geolocation)throw new Error('Browser lacks geolocation.');
 return new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(
  p=>res({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy}),
  e=>{
   const byCode={1:'Location access denied.',2:'Location unavailable right now.',3:'Location request timed out.'};
   rej(new Error(byCode[e.code]||e.message||'Unable to get your location.'));
  },
  {enableHighAccuracy:true,timeout:12000,maximumAge:maxAge}
 ));
}

function stopLocationWatch() {
  if (S.locationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(S.locationWatchId);
    S.locationWatchId = null;
  }
}

function startLocationWatch() {
  stopLocationWatch();
  if (DEV_MODE || !navigator.geolocation) return;

  S.locationWatchId = navigator.geolocation.watchPosition(position => {
    if ($('walk').classList.contains('hidden') || !S.map) return;
    S.user = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    userMarker(S.user);
    update();
  }, () => {}, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000
  });
}

window.addEventListener('pagehide', stopLocationWatch);

// Map Setup & Toggles
const tilesMystery = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
const tilesStandard = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
let currentTileLayer = null;
let isMysteryMap = true;
let routeLayer = null;
let routeRequestController = null;
let routeRequestToken = 0;

function clearRoute() {
  routeRequestToken++;
  if (routeRequestController) {
    routeRequestController.abort();
    routeRequestController = null;
  }
  if (routeLayer && S.map) {
    S.map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

async function initMap(p){
 if(S.map)return;

 S.map = L.map('map', {
   zoomControl: false,
   attributionControl: true,
   preferCanvas: true,
   rotate: true,
   touchRotate: true,
   shiftKeyRotate: true
 }).setView([p.lat,p.lon], 15.2);

 currentTileLayer = L.tileLayer(tilesMystery, {
   maxZoom: 19,
   attribution: '&copy; CartoDB | &copy; OpenStreetMap'
 }).addTo(S.map);

 await new Promise(res => S.map.whenReady(res));
}

$('mapStyleToggle').onclick = () => {
  if (!S.map) return;
  isMysteryMap = !isMysteryMap;
  const url = isMysteryMap ? tilesMystery : tilesStandard;
  const attr = isMysteryMap ? '&copy; CartoDB | &copy; OpenStreetMap' : '&copy; OpenStreetMap contributors';

  S.map.removeLayer(currentTileLayer);
  currentTileLayer = L.tileLayer(url, {maxZoom: 19, attribution: attr}).addTo(S.map);

  $('mapStyleToggle').style.color = isMysteryMap ? '' : 'var(--acid)';
  toast(isMysteryMap ? "Map Labels Hidden" : "Standard Map Enabled");
};

function userMarker(p){
 const icon=L.divIcon({className:'',html:'<div style="width:18px;height:18px;border-radius:50%;background:#65a9ff;border:3px solid white;box-shadow:0 0 0 7px rgba(101,169,255,.18)"></div>',iconSize:[18,18],iconAnchor:[9,9]});
 if(!S.userMarker)S.userMarker=L.marker([p.lat,p.lon],{icon,interactive:false}).addTo(S.map);else S.userMarker.setLatLng([p.lat,p.lon]);
}
function targetMarker(t){
 if(S.targetMarker)S.targetMarker.remove();
 const accent=appearanceColors().accent;
 const icon=L.divIcon({className:'',html:`<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${accent};border:3px solid #111;box-shadow:0 7px 20px rgba(0,0,0,.3)"></div>`,iconSize:[30,30],iconAnchor:[15,30]});
 S.targetMarker=L.marker([t.lat,t.lon],{icon,interactive:false}).addTo(S.map);
}

function getZoomForDist(d) {
  if (d > 3500) return 13;
  if (d > 2000) return 14;
  if (d > 800) return 15;
  if (d > 300) return 16;
  if (d > 100) return 17;
  return 18;
}

function focusMap(animate = true) {
  if (!S.user || !S.target) return;
  const d = dist(S.user, S.target);
  const zoom = getZoomForDist(d);
  if (animate) {
    S.map.flyTo([S.user.lat, S.user.lon], zoom, {duration: 0.85});
  } else {
    S.map.setView([S.user.lat, S.user.lon], zoom);
  }
}

// Device orientation for map rotation
$('rotateTop').onclick = () => {
  S.mapRotationEnabled = !S.mapRotationEnabled;
  if (S.mapRotationEnabled) {
    $('rotateTop').style.color = 'var(--acid)';
    if(window.DeviceOrientationEvent) {
      if(typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(permissionState => {
          if(permissionState === 'granted') { startCompass(); } else { toast("Permission denied"); S.mapRotationEnabled = false; }
        }).catch(console.error);
      } else {
        startCompass();
      }
    } else {
      toast("Device orientation not supported");
      S.mapRotationEnabled = false;
      $('rotateTop').style.color = '';
    }
  } else {
    $('rotateTop').style.color = '';
    stopCompass();
    if(S.map) S.map.setBearing(0);
  }
};

function startCompass() {
  if (S.headingListener) return;
  S.headingListener = (e) => {
    if(!S.mapRotationEnabled) return;
    let heading = null;
    if (e.webkitCompassHeading) heading = e.webkitCompassHeading;
    else if (e.alpha !== null) heading = 360 - e.alpha;

    if (heading !== null && S.map && S.map.setBearing) {
      S.map.setBearing(heading);
    }
  };
  window.addEventListener('deviceorientation', S.headingListener, true);
}
function stopCompass() {
  if (S.headingListener) {
    window.removeEventListener('deviceorientation', S.headingListener, true);
    S.headingListener = null;
  }
}

// GEOAPIFY FETCHING
async function geoapifySearch(p, r){
  const key = localStorage.getItem(STORAGE_KEYS.apiKey);
  if(!key) throw new Error('API key missing. Open settings to add it.');

  const cats = selectedQueryTokens().join(',');
  if (!cats) throw new Error('Choose at least one destination category.');

  const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(cats)}&filter=circle:${p.lon},${p.lat},${r}&limit=250&apiKey=${encodeURIComponent(key.trim())}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`API Error ${res.status}: ${errData.message || 'Unknown server error'}`);
    }
    const data = await res.json();
    clearTimeout(t);

    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Geoapify returned an unexpected Places response.');
    }

    return data.features.map(f => {
      const props = f.properties || {};

      // Terrain Filtering
      if (S.terrain === 'paved' && props.categories && !S.vibes.includes('wild')) {
        if (props.categories.some(c => c.startsWith('natural') || c === 'leisure.nature_reserve')) return null;
      }

      if (!f.geometry || f.geometry.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) return null;

      const c = {
        lat: Number(f.geometry.coordinates[1]),
        lon: Number(f.geometry.coordinates[0])
      };
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return null;

      const locationName = props.name || props.street || props.formatted || 'Local Discovery';

      return {
        ...c,
        name: locationName,
        dist: dist(p, c),
        origId: props.place_id,
        categories: props.categories || [],
        tags: { wikipedia: props.datasource?.raw?.wikipedia }
      };
    }).filter(Boolean);

  } catch(e) {
    clearTimeout(t);
    throw new Error(e.message);
  }
}

async function fetchRoute(start, end) {
  const key = localStorage.getItem(STORAGE_KEYS.apiKey);
  if(!key) return;
  const url = `https://api.geoapify.com/v1/routing?waypoints=${start.lat},${start.lon}|${end.lat},${end.lon}&mode=walk&apiKey=${encodeURIComponent(key.trim())}`;
  clearRoute();
  routeRequestController = new AbortController();
  const requestToken = ++routeRequestToken;

  try {
    const res = await fetch(url, {signal: routeRequestController.signal});
    if (!res.ok) return;
    const data = await res.json();
    if (requestToken !== routeRequestToken) return;
    const seconds = Number(data.features?.[0]?.properties?.time);
    S.routeMinutes = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds / 60)) : null;
    routeLayer = L.geoJSON(data, {
      style: {
        color: appearanceColors().route,
        weight: 6,
        opacity: 0.8,
        dashArray: '1, 8',
        lineCap: 'round'
      }
    }).addTo(S.map);
  } catch(e) {
    if (e.name !== 'AbortError') console.error("Routing error:", e);
  }
}

// BREADCRUMB LOGIC
const BREADCRUMB_RADIUS = 1500;

function cacheValid(){
  return S.candidatesOrigin && S.candidates.length > 0 && dist(S.user, S.candidatesOrigin) < 500;
}

async function fetchCandidates(radius = BREADCRUMB_RADIUS){
 S.candidates = await geoapifySearch(S.user, radius);
 S.candidatesOrigin = S.user;
 S.candidatesRadius = radius;
}

function filterPool(items) {
  const min = 75; // Lowered from 200 so it doesn't skip nearby spots
  const max = S.candidatesRadius || BREADCRUMB_RADIUS;
  const seen = new Set(S.used);
  return items
    .map(x => ({...x, dist: dist(S.user, x)}))
    .filter(x => x.dist >= min && x.dist <= max && !seen.has(placeKey(x)));
}

function placeKey(place) {
  if (place?.origId) return place.origId;
  if (Number.isFinite(place?.lat) && Number.isFinite(place?.lon)) return `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
  return String(place?.name || 'unknown-place').toLowerCase();
}

function categoryGroup(place) {
  const value = (place.categories || []).join(' ');
  if (/catering\.|restaurant|cafe|pub/.test(value)) return 'food';
  if (/natural|leisure\.park|viewpoint|garden/.test(value)) return 'nature';
  if (/artwork|museum|culture|gallery/.test(value)) return 'art';
  if (/heritage|historic|monument|religion|memorial/.test(value)) return 'history';
  return 'curious';
}

function categoryLabel(place) {
  const labels = {food:'Food & drink',nature:'Nature',art:'Art & culture',history:'History',curious:'Local curiosity'};
  return labels[categoryGroup(place)];
}

function formatJournalDate(value) {
  if (!value) return 'Earlier discovery';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier discovery';
  return new Intl.DateTimeFormat(undefined, {day:'numeric',month:'short',year:'numeric'}).format(date);
}

function renderJournal() {
  const entries = [...S.journal].reverse();
  $('journalList').innerHTML = entries.length ? entries.map(place => `
    <article class="journal-item">
      <div class="journal-item-head"><b>${esc(place.name || 'Local discovery')}</b><time>${esc(formatJournalDate(place.discoveredAt))}</time></div>
      <div class="journal-tags"><span class="journal-tag">${esc(categoryLabel(place))}</span><span class="journal-tag">${place.questMode === 'just_walk' ? 'Endless' : 'Mystery'}</span>${place.givenUp ? '<span class="journal-tag">Revealed</span>' : ''}</div>
      <p>${esc(place.cachedDesc || blurb(place))}</p>
    </article>`).join('') : '<div class="journal-empty">No discoveries yet. Complete a destination and it will appear here.</div>';
  $('clearJournalBtn').classList.toggle('hidden', !entries.length);
}

function openJournal() {
  renderJournal();
  $('home').classList.add('hidden');
  $('journal').classList.remove('hidden');
}

function closeJournal() {
  $('journal').classList.add('hidden');
  $('home').classList.remove('hidden');
}

// RUBBER BAND LOGIC & SCORING
function sortCandidates(clean) {
  const timeElapsed = Date.now() - S.startedAt;
  const timeLimit = S.minutes * 60 * 1000;
  const isReturningPhase = S.mode === 'mystery' && timeElapsed > (timeLimit * 0.5);
  const currentDistToStart = dist(S.user, S.startLoc);

  return clean.map(x => {
    let score = Math.random(); // Keep a baseline of serendipity

    // Reward candidates that match several of the selected vibes.
    if (x.categories && x.categories.length > 0) {
        const vibeMatches = S.vibes.filter(vibe => {
          const tokens = availableTokensForVibe(vibe);
          return x.categories.some(category => tokens.some(token => category.includes(token)));
        }).length;
        const categoryMatches = x.categories.filter(category => selectedQueryTokens().some(token => category.includes(token))).length;
        score += (vibeMatches * 1.5) + Math.min(categoryMatches, 3) * 0.5;
    }

    // Reward rich metadata
    if (x.tags && x.tags.wikipedia) score += 2.0;
    if (x.name && x.name !== 'Local Discovery') score += 1.0;

    // Home returning urgency (preserved for Mystery mode)
    if (isReturningPhase) {
      const distToStart = dist(x, S.startLoc);
      if (distToStart < currentDistToStart) {
        score += 4.0;
      }
    }
    return {x, score};
  }).sort((a,b) => b.score - a.score).map(x => x.x);
}

function discoveryResults() {
  const visited = new Set(S.journal.map(placeKey));
  let results = (S.sortedPool || [])
    .map(place => ({...place, dist: dist(S.user, place)}))
    .filter(place => !S.used.has(placeKey(place)))
    .filter(place => place.dist <= S.discoveryRange)
    .filter(place => S.discoveryFilter === 'all' || categoryGroup(place) === S.discoveryFilter);

  if (S.discoverySort === 'nearest') results.sort((a, b) => a.dist - b.dist);
  if (S.discoverySort === 'unusual') {
    results.sort((a, b) => {
      const score = place => (place.tags?.wikipedia ? 2 : 0) + (categoryGroup(place) === 'curious' ? 2 : 0) + (visited.has(placeKey(place)) ? -5 : 0);
      return score(b) - score(a) || a.dist - b.dist;
    });
  }
  return results;
}

function renderDiscoveryBrowser() {
  S.phase = 'browsing';
  S.target = null;
  saveActiveQuest();
  const results = discoveryResults();
  const visible = results.slice(0, S.discoveryLimit);
  S.visibleDiscoveries = visible;
  const visited = new Set(S.journal.map(placeKey));
  const filters = [
    ['all','All'],['history','History'],['art','Art'],['nature','Nature'],['food','Food'],['curious','Curious']
  ];

  const items = visible.map((place, index) => {
    const name = place.name === 'Local Discovery' ? 'Hidden local gem' : place.name;
    const direction = compass(bearing(S.user, place));
    const wasVisited = visited.has(placeKey(place));
    return `<button class="discovery-item" data-discovery-index="${index}">
      <span><b>${esc(name)}</b><small>${esc(categoryLabel(place))} · ${direction}${wasVisited ? ' · <span class="visited">Visited</span>' : ''}</small></span>
      <span class="discovery-distance">${fd(place.dist).replace(' away','')}<small>~${estimatedWalkMinutes(place.dist)} min</small></span>
    </button>`;
  }).join('');

  $('bottomCard').className = 'bottom-card browser-card';
  $('bottomCard').innerHTML = `
    <div class="statusline"><span>Endless discovery</span><span>${results.length} nearby</span></div>
    <h2 class="mystery-title">Where next?</h2>
    <p class="mystery-copy">Browse somewhere nearby or let WanderQuest surprise you.</p>
    <div class="browser-toolbar">
      <label><span class="sr-only">Sort places</span><select id="discoverySort"><option value="recommended">Recommended</option><option value="nearest">Nearest</option><option value="unusual">Most unusual</option></select></label>
      <label><span class="sr-only">Maximum distance</span><select id="discoveryRange"><option value="500">Within 500 m</option><option value="1000">Within 1 km</option><option value="2000">Within 2 km</option><option value="5000">Within 5 km</option></select></label>
    </div>
    <div class="filter-chips">${filters.map(([key,label])=>`<button class="filter-chip ${S.discoveryFilter===key?'active':''}" data-filter="${key}">${label}</button>`).join('')}</div>
    <div class="discovery-list">${items || '<div class="journal-empty">No matching places in this range. Try a wider distance or another category.</div>'}</div>
    <div class="browser-footer"><button id="surpriseBtn">✦ SURPRISE ME</button><button id="refreshDiscoveryBtn">↻ REFRESH HERE</button></div>
    ${visible.length < results.length ? '<button id="loadMoreBtn" class="browser-utility">LOAD MORE</button>' : ''}
    <button id="mapOnlyBtn" class="browser-utility">SHOW MAP ONLY</button>`;

  $('discoverySort').value = S.discoverySort;
  $('discoveryRange').value = String(S.discoveryRange);
  $('discoverySort').onchange = event => { S.discoverySort = event.target.value; renderDiscoveryBrowser(); };
  $('discoveryRange').onchange = guarded(async event => {
    S.discoveryRange = Number(event.target.value);
    S.discoveryLimit = 8;
    if (S.discoveryRange > (S.candidatesRadius || 0)) {
      cardLoading();
      await fetchCandidates(S.discoveryRange);
      await processPool();
    } else {
      renderDiscoveryBrowser();
    }
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { S.discoveryFilter = button.dataset.filter; S.discoveryLimit = 8; renderDiscoveryBrowser(); });
  document.querySelectorAll('[data-discovery-index]').forEach(button => button.onclick = () => selectDiscoveryTarget(Number(button.dataset.discoveryIndex)));
  $('surpriseBtn').onclick = () => {
    if (!results.length) return toast('No locations match these filters.');
    S.visibleDiscoveries = [results[Math.floor(Math.random() * Math.min(results.length, 12))]];
    selectDiscoveryTarget(0);
  };
  $('refreshDiscoveryBtn').onclick = guarded(async () => {
    S.candidatesOrigin = null;
    S.discoveryLimit = 8;
    cardLoading();
    await fetchCandidates(S.discoveryRange);
    await processPool();
  });
  if ($('loadMoreBtn')) $('loadMoreBtn').onclick = () => { S.discoveryLimit += 8; renderDiscoveryBrowser(); };
  $('mapOnlyBtn').onclick = renderCompactBrowser;
}

function renderCompactBrowser() {
  $('bottomCard').className = 'bottom-card';
  $('bottomCard').innerHTML = '<div class="compact-browser"><div><span class="micro">Endless discovery</span><b>Explore the map</b></div><button id="openBrowserBtn">BROWSE PLACES</button></div>';
  $('openBrowserBtn').onclick = renderDiscoveryBrowser;
}

function cardLoading(){ $('bottomCard').innerHTML='<div class="loader"><span class="dot"></span> Searching nearby area…</div>'}

function update(){
 if(!S.user||!S.target)return;
 const dEl = $('distance');
 if(dEl) dEl.innerHTML=`${distLabel()} · ~${S.routeMinutes || estimatedWalkMinutes(dist(S.user,S.target))} min`;
 updateQuestClock();
}

async function expandSearch() {
  cardLoading();
  try {
    S.rangeMultiplier *= 1.5;
    let newRadius = Math.round(BREADCRUMB_RADIUS * S.rangeMultiplier);
    await fetchCandidates(newRadius);
    await processPool();
  } catch(e) {
    showError(e.message);
  }
}

function showError(msg) {
  $('bottomCard').innerHTML=`<div class="statusline"><span>Search paused</span></div><p class="mystery-copy">${esc(msg)}</p>
  <div class="actions">
    <button class="primary" id="retry" style="margin-top:0">TRY AGAIN</button>
  </div>`;
  $('retry').onclick=guarded(()=>mystery());
}

async function processPool() {
  let pool = filterPool(S.candidates);
  if (S.mode === 'mystery') pool = pool.filter(candidateFitsTimeBudget);

  if (S.mode === 'mystery' && S.discovered.length && shouldHeadHome()) {
    startReturnHome(false);
    return;
  }

  while(!pool.length && S.candidatesRadius < BREADCRUMB_RADIUS * 4) {
     S.rangeMultiplier *= 1.5;
     await fetchCandidates(Math.round(BREADCRUMB_RADIUS * S.rangeMultiplier));
     pool = filterPool(S.candidates);
     if (S.mode === 'mystery') pool = pool.filter(candidateFitsTimeBudget);
  }

  if(!pool.length) {
    // EMPTY SEARCH SAFETY NET
    $('bottomCard').innerHTML=`
      <div class="statusline"><span>Search Empty</span></div>
      <h2 class="mystery-title">Nothing found nearby.</h2>
      <p class="mystery-copy">There are no undiscovered places matching your filters and remaining time. You can search again or head back.</p>
      <div class="actions">
        <button class="locate" id="scanAgainBtn">⌖ Search Nearby</button>
        <button class="primary" id="emptyHomeBtn" style="margin-top:0">TAKE ME HOME</button>
      </div>
    `;

    S.candidatesOrigin = null;

    $('scanAgainBtn').onclick = guarded(mystery);
    $('emptyHomeBtn').onclick = goHome;
    return;
  }

  S.sortedPool = sortCandidates(pool);
  S.poolIndex = 0;

  setTargetFromPool();
}

function setTargetFromPool() {
  if(!S.sortedPool || S.sortedPool.length === 0) {
    toast("No more locations found here. Walk a bit and search again.");
    return;
  }

  const isJustWalk = S.mode === 'just_walk';
  const isHome = S.sortedPool[S.poolIndex]?.isHome;

  // Endless mode exposes a full nearby discovery browser.
  if (isJustWalk && !isHome) {
    renderDiscoveryBrowser();
    return;
  }

  // --- Standard Mystery Mode Logic (Preserved) ---
  S.target = S.sortedPool[S.poolIndex];
  S.used.add(placeKey(S.target));
  S.phase = isHome ? 'returning' : 'navigating';

  targetMarker(S.target);
  focusMap(true);
  fetchRoute(S.user, S.target);
  saveActiveQuest();

  const title = isHome ? "Heading Back" : "Something is waiting here.";
  const copy = isHome ? "Follow the route and compass back to where you started." : "No name. Just a route, the streets and a destination pin. Look up, read the signs and trust your instincts.";

  let actionsHtml = '';
  if (isHome) {
     actionsHtml = `
      <div class="actions">
        <button class="locate" id="locateBtn">⌖ Locate Me</button>
        <button class="here" id="hereBtn">I'M HERE</button>
      </div>`;
  } else {
     actionsHtml = `
      <div class="actions">
        <button class="locate" id="locateBtn">⌖ Locate Me</button>
        <button class="here" id="hereBtn">I'M HERE</button>
      </div>
      <div class="actions secondary">
        <button class="btn-muted" id="reselectBtn">↻ Reselect</button>
        <button class="btn-muted" id="giveUpBtn">⚐ Give Up</button>
      </div>`;
  }

  let progressHtml = '';
  if (S.mode === 'mystery' && !isHome) {
     progressHtml = `<div class="progress"><i style="width:${Math.min(100,(S.stop/S.maxStops)*100)}%"></i></div>`;
  }

  $('bottomCard').innerHTML=`
  <div class="statusline"><span>${isHome ? 'Return Journey' : `${remainingMinutes()} min remaining`}</span><div class="distance" id="distance">${distLabel()} · ~${estimatedWalkMinutes(dist(S.user,S.target))} min</div></div>
  ${progressHtml}
  <h2 class="mystery-title">${title}</h2>
  <p class="mystery-copy">${copy}</p>
  ${actionsHtml}`;

  $('locateBtn').onclick=guarded(locate);
  $('hereBtn').onclick=guarded(arrive);

  if(!isHome) {
     $('reselectBtn').onclick = () => {
       S.poolIndex++;
       if (S.poolIndex >= S.sortedPool.length) {
         toast("Searching a wider area for more options...");
         expandSearch();
       } else {
         setTargetFromPool();
       }
     };
     $('giveUpBtn').onclick = () => { if(confirm("Reveal this location on the map? It will not count towards your discovered total.")) reveal(true); };
  }
}

function selectDiscoveryTarget(idx) {
    S.target = S.visibleDiscoveries[idx];
    if (!S.target) return toast('That location is no longer available.');
    S.used.add(placeKey(S.target));
    S.phase = 'navigating';

    targetMarker(S.target);
    focusMap(true);
    fetchRoute(S.user, S.target);
    saveActiveQuest();

    const displayName = S.target.name !== 'Local Discovery' ? esc(S.target.name) : 'Unknown Gem';

    $('bottomCard').className = 'bottom-card';
    $('bottomCard').innerHTML=`
      <div class="statusline"><span>Discovery Route</span><div class="distance" id="distance">${distLabel()}</div></div>
      <h2 class="mystery-title">${displayName}</h2>
      <p class="mystery-copy">Follow the mapped route to your chosen destination.</p>
      <div class="actions">
        <button class="locate" id="locateBtn">⌖ Locate Me</button>
        <button class="here" id="hereBtn">I'M HERE</button>
      </div>
      <div class="actions secondary" style="margin-top:7px">
         <button class="btn-muted" id="discoverBtn">↻ Search Nearby</button>
         <button class="btn-muted" id="giveUpBtn">⚐ Give Up</button>
      </div>
    `;

    $('locateBtn').onclick = guarded(locate);
    $('hereBtn').onclick = guarded(arrive);
    $('discoverBtn').onclick = () => { clearRoute(); S.target = null; renderDiscoveryBrowser(); };
    $('giveUpBtn').onclick = () => { if(confirm("Reveal this location on the map?")) reveal(true); };
}

async function mystery(){
 cardLoading();
 try{
  if(!S.target) S.rangeMultiplier = 1;
  if(!cacheValid()) await fetchCandidates(Math.round(BREADCRUMB_RADIUS * S.rangeMultiplier));
  await processPool();
 }catch(e){
  showError(e.message);
 }
}

async function locate(){
 try{
   S.user=await pos();
   userMarker(S.user);
   update();
   if(!S.target) await mystery();
   else focusMap(true);
 }catch(e){toast(e.message)}
}

async function arrive(){
 try{
   S.user=await pos(0);
   userMarker(S.user);
   const d=dist(S.user,S.target);
   if(d>80){toast(`Not yet — about ${Math.round(d)} m to go.`); update(); focusMap(true); return}
   if (S.target.isHome) { finish(); return; }
   reveal(false);
 }catch(e){toast(e.message)}
}

async function enrich(t){
 const wp=t.tags?.wikipedia;
 if(!wp)return null;
 const m=/^([a-z-]+):(.+)$/i.exec(wp);
 const lang=m?m[1]:'en',title=m?m[2]:wp;
 const ctrl=new AbortController();
 const to=setTimeout(()=>ctrl.abort(),6000);
 try{
  const r=await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,{signal:ctrl.signal});
  clearTimeout(to);
  if(!r.ok)return null;
  const d=await r.json();
  if(d.type==='disambiguation')return null;
  return {extract:d.extract||null,thumb:d.thumbnail?.source||null,pageUrl:d.content_urls?.desktop?.page||null};
 }catch(e){clearTimeout(to);return null}
}

function displayHistory(idx) {
  S.viewingHistoryIdx = idx;
  const t = S.discovered[idx];
  if (!t) return;

  if (S.mode === 'just_walk') {
     $('revealStopText').textContent = `Discovery ${idx + 1}`;
  } else {
     $('revealStopText').textContent = `stop ${idx + 1}`;
  }

  if (t.givenUp) {
     $('revealKickerText').textContent = 'Location Revealed';
     $('revealName').textContent = t.name || 'A known local spot';
     $('revealChallenge').classList.add('hidden');
  } else {
     $('revealKickerText').textContent = 'Mystery solved';
     $('revealName').textContent = t.name || 'You found it.';

     if (t.challenge) {
       $('revealChallenge').textContent = `LOOK CLOSER: ${t.challenge}`;
       $('revealChallenge').classList.remove('hidden');
     } else {
       $('revealChallenge').classList.add('hidden');
     }
  }

  $('revealText').textContent = t.cachedDesc || blurb(t);
  $('revealTags').innerHTML = tags(t).map(x=>`<span class="tag">${esc(x.replace(/\./g, ' '))}</span>`).join('');

  $('revealFacts').innerHTML='';

  if (t.cachedThumb) { $('revealImg').src = t.cachedThumb; $('revealImgWrap').classList.remove('hidden'); }
  else { $('revealImgWrap').classList.add('hidden'); $('revealImg').src = ''; }

  if (t.cachedUrl) { $('revealSource').href = t.cachedUrl; $('revealSource').classList.remove('hidden'); }
  else { $('revealSource').classList.add('hidden'); }

  // Navigation
  $('prevStopBtn').classList.toggle('hidden', idx === 0);
  $('nextStopBtn').classList.toggle('hidden', idx >= S.discovered.length - 1);

  if (idx === S.discovered.length - 1 && S.phase === 'reveal') {
    if (S.mode === 'mystery' && shouldHeadHome()) {
       $('nextBtn').textContent = "HEAD BACK →";
    } else {
       $('nextBtn').textContent = S.mode === 'just_walk' ? "BROWSE MORE PLACES →" : "REVEAL NEXT MYSTERY →";
    }
    $('nextBtn').classList.remove('hidden');
  } else {
    $('nextBtn').classList.add('hidden');
  }
}

function reveal(isGiveUp = false){
 const t=S.target;
 S.revealToken++; const myToken=S.revealToken;

 t.cachedDesc = blurb(t);
 t.givenUp = isGiveUp;
 t.discoveredAt = t.discoveredAt || new Date().toISOString();
 t.questId = S.questId;
 t.questMode = S.mode;
 t.vibes = [...S.vibes];
 t.selectedCategories = [...S.selectedCategories];
 if (!isGiveUp) {
   t.challenge = getRandomPrompt();
 }

 S.discovered.push(t);
 S.journal.push(t);
 S.phase = 'reveal';
 saveHistory(); // Persist discoveries
 saveActiveQuest();

 const currentIdx = S.discovered.length - 1;

 $('bottomCard').classList.add('hidden');
 $('revealCard').classList.remove('hidden');

 if(S.targetMarker)S.targetMarker.remove();S.targetMarker=null;
 clearRoute();

 displayHistory(currentIdx);

 enrich(t).then(info=>{
  if(!info||S.revealToken!==myToken)return;
  if(info.extract) t.cachedDesc = info.extract;
  if(info.thumb&&/^https:\/\//i.test(info.thumb)) t.cachedThumb = info.thumb;
  if(info.pageUrl&&/^https:\/\//i.test(info.pageUrl)) t.cachedUrl = info.pageUrl;

  saveHistory(); // Re-save if enriched data arrives
  if (S.viewingHistoryIdx === currentIdx) displayHistory(currentIdx);
 });
}

$('prevStopBtn').onclick = () => { if (S.viewingHistoryIdx > 0) displayHistory(S.viewingHistoryIdx - 1); };
$('nextStopBtn').onclick = () => { if (S.viewingHistoryIdx < S.discovered.length - 1) displayHistory(S.viewingHistoryIdx + 1); };

// Dismiss the Location Info pane
$('closeRevealBtn').onclick = () => {
  $('revealCard').classList.add('hidden');

  if (!$('finishCard').classList.contains('hidden')) return;

  if (S.target && S.discovered.includes(S.target)) {
    const isFinished = (S.mode === 'mystery' && shouldHeadHome());
    const stopText = S.mode === 'just_walk' ? `Discovery ${S.discovered.length}` : `Stop ${S.stop} / ${S.maxStops}`;

    $('bottomCard').innerHTML = `
      <div class="statusline"><span>${stopText}</span></div>
      <h2 class="mystery-title">Location Revealed</h2>
      <p class="mystery-copy">You can explore the map. When you're ready, move on to the next location.</p>
      <div class="actions">
        <button class="primary" id="bottomNextBtn" style="margin-top:0">${isFinished ? 'HEAD BACK →' : S.mode === 'just_walk' ? 'BROWSE MORE →' : 'NEXT MYSTERY →'}</button>
      </div>
    `;
    $('bottomNextBtn').onclick = () => $('nextBtn').click();
    $('bottomCard').classList.remove('hidden');
  }
  else {
    $('bottomCard').classList.remove('hidden');
  }
};

function finish(){
 $('revealCard').classList.add('hidden');$('bottomCard').classList.add('hidden');$('finishCard').classList.remove('hidden');
 clearRoute();
 S.phase = 'finished';
 clearActiveQuest();
 stopLocationWatch();

 const foundCount = S.discovered.filter(x => !x.givenUp).length;

 $('foundCount').textContent=foundCount;$('statStops').textContent=foundCount;

 if (S.mode === 'just_walk') {
    $('statTime').textContent=elapsedLabel();
    $('statVibe').textContent='Just Walk';
    $('finishCopy').textContent='You followed the compass and let the streets reveal themselves to you.';
 } else {
    $('statTime').textContent=elapsedLabel();
    $('statVibe').textContent=selectedVibeLabel();
    $('finishCopy').textContent='The destination was never the point. You got outside, paid attention and let somewhere unexpected become part of your day.';
 }
}

$('nextBtn').onclick=guarded(async()=>{
  if(S.mode === 'mystery' && shouldHeadHome()){startReturnHome(false);return}
  if(S.mode === 'mystery') S.stop++;

  $('revealCard').classList.add('hidden');
  $('bottomCard').classList.remove('hidden');

  if (S.mode === 'mystery') {
    $('stopCountText').textContent=`· STOP ${S.stop} / ${S.maxStops}`;
  }

  S.target=null;
  S.phase='searching';
  saveActiveQuest();
  await mystery();
});

function startReturnHome(confirmUser = true) {
  if (!S.startLoc) return toast("Start location lost.");
  if (!confirmUser || confirm("Navigate back to where you started?")) {
    $('revealCard').classList.add('hidden');
    $('finishCard').classList.add('hidden');
    $('bottomCard').classList.remove('hidden');
    S.target = { ...S.startLoc, name: "Start Location", isHome: true };
    S.phase = 'returning';
    targetMarker(S.target);
    focusMap(true);
    S.sortedPool = [S.target];
    S.poolIndex = 0;
    setTargetFromPool();
    saveActiveQuest();
  }
}

function goHome() { startReturnHome(true); }

$('goHomeBtn').onclick = goHome;

$('locateTop').onclick=guarded(locate);
$('historyPill').onclick = () => {
  if (S.discovered.length > 0 && $('revealCard').classList.contains('hidden')) {
    $('bottomCard').classList.add('hidden');
    $('revealCard').classList.remove('hidden');
    displayHistory(S.discovered.length - 1);
  }
};

async function launchExperience(mode) {
 if (!localStorage.getItem(STORAGE_KEYS.apiKey)) {
   $('settingsPanel').classList.remove('hidden');
   toast("Please save your free API key first.");
   return;
 }

 $('startBtn').disabled=true;
 $('justWalkBtn').disabled=true;
 try{
  S.mode = mode;
  clearActiveQuest();
  S.stop = 1;
  S.target = null;
  S.discovered = [];
  S.used = new Set();
  S.questId = globalThis.crypto?.randomUUID?.() || `quest-${Date.now()}`;
  S.user = await pos();
  S.startLoc = {...S.user};
  $('home').classList.add('hidden');$('walk').classList.remove('hidden');

  S.startedAt=Date.now();
  S.deadline=S.startedAt + S.minutes * 60 * 1000;
  S.phase='searching';
  updateWalkHeader();
  await initMap(S.user);
  userMarker(S.user);
  startLocationWatch();
  saveActiveQuest();
  await mystery();
  $('startBtn').disabled=false;
  $('justWalkBtn').disabled=false;
 }catch(e){
  $('walk').classList.add('hidden');$('home').classList.remove('hidden');
  $('startBtn').disabled=false;$('justWalkBtn').disabled=false;
  toast(e.message);
 }
}

function updateWalkHeader() {
  if (S.mode === 'just_walk') {
    $('vibeLabel').textContent='ENDLESS';
    $('stopCountText').textContent='';
  } else {
    $('vibeLabel').textContent=selectedVibeLabel();
    $('stopCountText').textContent=`· STOP ${S.stop} / ${S.maxStops}`;
  }
  updateQuestClock();
}

async function resumeActiveQuest() {
  const saved = loadActiveQuest();
  if (!saved) return toast('That saved walk is no longer available.');
  $('resumeBtn').disabled = true;
  try {
    S.mode = saved.mode;
    const resumedVibes = Array.isArray(saved.vibes) ? saved.vibes.filter(vibe => VIBE_CONFIG[vibe]).slice(0,3) : [];
    S.vibes = resumedVibes.length ? resumedVibes : [VIBE_CONFIG[saved.vibe] ? saved.vibe : 'history'];
    const resumedAvailable = new Set(availableCategoryIds());
    const resumedCategories = Array.isArray(saved.categories) ? saved.categories.filter(id => resumedAvailable.has(id)) : [];
    S.selectedCategories = resumedCategories.length ? resumedCategories : defaultCategoryIds();
    S.minutes = Number(saved.minutes) || 60;
    S.terrain = saved.terrain || 'paved';
    S.startLoc = saved.startLoc;
    S.target = saved.target;
    S.stop = Number(saved.stop) || 1;
    S.maxStops = Number(saved.maxStops) || 5;
    S.startedAt = Number(saved.startedAt) || Date.now();
    S.deadline = Number(saved.deadline) || S.startedAt + S.minutes * 60 * 1000;
    S.discovered = Array.isArray(saved.discovered) ? saved.discovered : [];
    S.used = new Set(Array.isArray(saved.used) ? saved.used : []);
    S.phase = saved.phase || 'searching';
    S.questId = saved.questId || `quest-${S.startedAt}`;
    S.user = await pos();

    $('home').classList.add('hidden');
    $('journal').classList.add('hidden');
    $('walk').classList.remove('hidden');
    updateWalkHeader();
    await initMap(S.user);
    userMarker(S.user);
    startLocationWatch();

    if (S.phase === 'reveal' && S.discovered.length) {
      S.target = S.discovered[S.discovered.length - 1];
      $('bottomCard').classList.add('hidden');
      $('revealCard').classList.remove('hidden');
      displayHistory(S.discovered.length - 1);
    } else if (S.target) {
      if (S.mode === 'just_walk' && !S.target.isHome) {
        S.visibleDiscoveries = [S.target];
        selectDiscoveryTarget(0);
      } else {
        S.sortedPool = [S.target];
        S.poolIndex = 0;
        setTargetFromPool();
      }
    } else {
      await mystery();
    }
    toast('Walk resumed');
  } catch (error) {
    $('walk').classList.add('hidden');
    $('home').classList.remove('hidden');
    toast(error.message);
  } finally {
    $('resumeBtn').disabled = false;
  }
}

$('startBtn').onclick=()=>launchExperience('mystery');
$('justWalkBtn').onclick=()=>launchExperience('just_walk');

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  S.installPrompt = event;
  $('installBtn').classList.remove('hidden');
});

$('installBtn').onclick = async () => {
  if (!S.installPrompt) return toast('Use your browser menu to install WanderQuest.');
  S.installPrompt.prompt();
  await S.installPrompt.userChoice;
  S.installPrompt = null;
  $('installBtn').classList.add('hidden');
};

window.addEventListener('appinstalled', () => {
  S.installPrompt = null;
  $('installBtn').classList.add('hidden');
  toast('WanderQuest installed');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker registration failed', error)));
}

$('journalBtn').onclick=openJournal;
$('closeJournalBtn').onclick=closeJournal;
$('clearJournalBtn').onclick=()=>{
  if (!confirm('Clear every saved discovery from this device?')) return;
  S.journal=[];
  saveHistory();
  renderJournal();
};
$('resumeBtn').onclick=resumeActiveQuest;
$('discardResumeBtn').onclick=()=>{if(confirm('Discard the saved walk?')){clearActiveQuest();$('resumeCard').classList.add('hidden')}};

$('exitBtn').onclick=()=>{if(confirm('Leave and discard this wander?')){clearActiveQuest();location.reload()}};
$('againBtn').onclick=()=>{clearActiveQuest();location.reload()};
$('homeBtn').onclick=()=>{clearActiveQuest();location.reload()};
