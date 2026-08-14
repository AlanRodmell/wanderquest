// Geoapify Categories Configuration
const cfg={
  history:{label:'TIME TRAVELER',query:`heritage,building.historic,tourism.sights`},
  art:{label:'CONCRETE CANVAS',query:`entertainment.museum,entertainment.culture,tourism.attraction.artwork,tourism.sights`},
  curious:{label:'CURIOUS',query:`tourism.attraction,tourism.sights,entertainment.culture,religion`},
  wild:{label:'WILD CARD',query:`natural,leisure.park,leisure.park.nature_reserve,tourism.attraction.viewpoint`},
  just_walk:{label:'JUST WALK',query:`tourism,heritage,leisure.park,entertainment,catering.cafe,catering.pub`}
};

const discoveryPrompts = [
  "Look closely at the architecture. What specific details stand out?",
  "Take a moment to read any plaques, signs, or inscriptions nearby.",
  "Look for traces of how this place has changed over time.",
  "What is the most easily overlooked detail here?",
  "Observe the texture of the materials around you.",
  "What vibes or historical weight does this corner hold?",
  "Try to find a marker, date, or name carved somewhere nearby."
];

function getRandomPrompt() {
  return discoveryPrompts[Math.floor(Math.random() * discoveryPrompts.length)];
}

const S = {
  mode: 'mystery',
  vibe: 'history',
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
  locationWatchId: null
};

let busy = false; let DEV_MODE = false; let DEV_LOCATION = {lat:53.4084,lon:-2.9916,accuracy:25};
function guarded(fn){return async(...a)=>{if(busy)return;busy=true;try{await fn(...a)}finally{busy=false}}}
const $ = id => document.getElementById(id);

// Settings & API Key Setup
const savedKey = localStorage.getItem('wq_geoapify_key');
if (savedKey) $('apiKeyInput').value = savedKey;

$('settingsToggle').onclick = () => { $('settingsPanel').classList.toggle('hidden'); };
$('settingsClose').onclick = () => { $('settingsPanel').classList.add('hidden'); };
$('saveKeyBtn').onclick = () => {
  const key = $('apiKeyInput').value.trim();
  localStorage.setItem('wq_geoapify_key', key);
  toast("API Key Saved successfully");
};

function loadHistory() {
  try {
    const saved = localStorage.getItem('wq_history');
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
    localStorage.setItem('wq_history', JSON.stringify({
      version: 2,
      journal: S.journal
    }));
  } catch(e) {}
}

loadHistory();

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
document.querySelectorAll('.vibe').forEach(b=>b.onclick=()=>{document.querySelectorAll('.vibe').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');S.vibe=b.dataset.vibe});
document.querySelectorAll('.duration').forEach(b=>b.onclick=()=>{document.querySelectorAll('.duration').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');S.minutes=+b.dataset.min;S.maxStops=S.minutes<=30?3:S.minutes<=60?5:S.minutes<=90?7:9});
document.querySelectorAll('.terrain-opts .option').forEach(b=>b.onclick=()=>{document.querySelectorAll('.terrain-opts .option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');S.terrain=b.dataset.terrain});

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
 const icon=L.divIcon({className:'',html:'<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#d7ff4f;border:3px solid #111;box-shadow:0 7px 20px rgba(0,0,0,.3)"></div>',iconSize:[30,30],iconAnchor:[15,30]});
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
  const key = localStorage.getItem('wq_geoapify_key');
  if(!key) throw new Error('API key missing. Open settings to add it.');

  const activeVibe = S.mode === 'just_walk' ? 'just_walk' : S.vibe;
  const cats = cfg[activeVibe].query;

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
      if (S.terrain === 'paved' && props.categories && S.vibe !== 'wild') {
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
  const key = localStorage.getItem('wq_geoapify_key');
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
    routeLayer = L.geoJSON(data, {
      style: {
        color: '#d7ff4f',
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
  return place.origId || `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
}

// RUBBER BAND LOGIC & SCORING
function sortCandidates(clean) {
  const timeElapsed = Date.now() - S.startedAt;
  const timeLimit = S.minutes * 60 * 1000;
  const isReturningPhase = S.mode === 'mystery' && timeElapsed > (timeLimit * 0.5);
  const currentDistToStart = dist(S.user, S.startLoc);

  return clean.map(x => {
    let score = Math.random(); // Keep a baseline of serendipity

    // Better vibe-aware scoring based on category density
    if (x.categories && x.categories.length > 0) {
        const vibeCats = cfg[S.vibe].query.split(',');
        const matchCount = x.categories.filter(c => vibeCats.some(vc => c.includes(vc))).length;
        score += (matchCount * 1.5);
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

function cardLoading(){ $('bottomCard').innerHTML='<div class="loader"><span class="dot"></span> Searching nearby area…</div>'}

function update(){
 if(!S.user||!S.target)return;
 const dEl = $('distance');
 if(dEl) dEl.innerHTML=distLabel();
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

  while(!pool.length && S.candidatesRadius < BREADCRUMB_RADIUS * 4) {
     S.rangeMultiplier *= 1.5;
     await fetchCandidates(Math.round(BREADCRUMB_RADIUS * S.rangeMultiplier));
     pool = filterPool(S.candidates);
  }

  if(!pool.length) {
    // EMPTY SEARCH SAFETY NET
    $('bottomCard').innerHTML=`
      <div class="statusline"><span>Search Empty</span></div>
      <h2 class="mystery-title">Nothing found nearby.</h2>
      <p class="mystery-copy">There are no undiscovered places matching your filters nearby. You can wander a bit and search again, or head back.</p>
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

  // If in Discovery mode and not heading home, show choices
  if (isJustWalk && !isHome) {
    const topChoices = S.sortedPool.slice(0, 3);

    let choicesHtml = topChoices.map((choice, idx) => {
       const walkTimeMin = Math.ceil(choice.dist / 80); // Estimate: ~80m per minute
       const displayName = choice.name !== 'Local Discovery' ? esc(choice.name) : 'Hidden Gem';

       return `
         <button class="option" onclick="selectDiscoveryTarget(${idx})" style="width:100%; margin-bottom:8px; display:block;">
           <b>${displayName}</b>
           <small>${Math.round(choice.dist)}m away • ~${walkTimeMin} min walk</small>
         </button>
       `;
    }).join('');

    $('bottomCard').innerHTML=`
      <div class="statusline"><span>Nearby Discovery</span></div>
      <h2 class="mystery-title">Choose Your Destination</h2>
      <p class="mystery-copy">Select a nearby worthwhile spot to navigate to.</p>
      <div style="margin: 12px 0;">
        ${choicesHtml}
      </div>
      <div class="actions">
         <button class="btn-muted" id="discoverBtn" style="width:100%">↻ Rescan Area</button>
      </div>
    `;

    $('discoverBtn').onclick = guarded(() => {
      S.candidatesOrigin = null;
      mystery();
    });

    return; // Halt here until user selects an option
  }

  // --- Standard Mystery Mode Logic (Preserved) ---
  S.target = S.sortedPool[S.poolIndex];
  S.used.add(placeKey(S.target));

  targetMarker(S.target);
  focusMap(true);
  fetchRoute(S.user, S.target);

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
  <div class="statusline"><span>${isHome ? 'Return Journey' : 'Mystery destination'}</span><div class="distance" id="distance">${distLabel()}</div></div>
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

// New Global Function to Handle Discovery Selection
window.selectDiscoveryTarget = function(idx) {
    S.target = S.sortedPool[idx];
    S.used.add(placeKey(S.target));

    targetMarker(S.target);
    focusMap(true);
    fetchRoute(S.user, S.target);

    const displayName = S.target.name !== 'Local Discovery' ? esc(S.target.name) : 'Unknown Gem';

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
    $('discoverBtn').onclick = guarded(() => { S.candidatesOrigin = null; mystery(); });
    $('giveUpBtn').onclick = () => { if(confirm("Reveal this location on the map?")) reveal(true); };
};

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
  $('nextStopBtn').classList.toggle('hidden', idx === S.discovered.length - 1 && S.target);

  if (idx === S.discovered.length - 1 && !S.target) {
    if (S.mode === 'mystery' && S.stop >= S.maxStops) {
       $('nextBtn').textContent = "FINISH QUEST →";
    } else {
       $('nextBtn').textContent = "REVEAL NEXT MYSTERY →";
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
 if (!isGiveUp) {
   t.challenge = getRandomPrompt();
 }

 S.discovered.push(t);
 S.journal.push(t);
 saveHistory(); // Persist discoveries

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
    const isFinished = (S.mode === 'mystery' && S.stop >= S.maxStops);
    const stopText = S.mode === 'just_walk' ? `Discovery ${S.discovered.length}` : `Stop ${S.stop} / ${S.maxStops}`;

    $('bottomCard').innerHTML = `
      <div class="statusline"><span>${stopText}</span></div>
      <h2 class="mystery-title">Location Revealed</h2>
      <p class="mystery-copy">You can explore the map. When you're ready, move on to the next location.</p>
      <div class="actions">
        <button class="primary" id="bottomNextBtn" style="margin-top:0">${isFinished ? 'FINISH QUEST →' : 'NEXT MYSTERY →'}</button>
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

 const foundCount = S.discovered.filter(x => !x.givenUp).length;

 $('foundCount').textContent=foundCount;$('statStops').textContent=foundCount;

 if (S.mode === 'just_walk') {
    $('statTime').textContent='∞';
    $('statVibe').textContent='Just Walk';
    $('finishCopy').textContent='You followed the compass and let the streets reveal themselves to you.';
 } else {
    $('statTime').textContent=S.minutes<60?S.minutes+'m':(S.minutes/60)+'h';
    $('statVibe').textContent=cfg[S.vibe].label;
    $('finishCopy').textContent='The destination was never the point. You got outside, paid attention and let somewhere unexpected become part of your day.';
 }
}

$('nextBtn').onclick=guarded(async()=>{
  if(S.mode === 'mystery' && S.stop>=S.maxStops){finish();return}
  if(S.mode === 'mystery') S.stop++;

  $('revealCard').classList.add('hidden');
  $('bottomCard').classList.remove('hidden');

  if (S.mode === 'mystery') {
    $('stopCountText').textContent=`· STOP ${S.stop} / ${S.maxStops}`;
  }

  S.target=null;
  await mystery();
});

function goHome() {
  if (!S.startLoc) return toast("Start location lost.");
  if (confirm("Navigate back to where you started?")) {
    $('revealCard').classList.add('hidden');
    $('bottomCard').classList.remove('hidden');
    S.target = { ...S.startLoc, name: "Start Location", isHome: true };
    targetMarker(S.target);
    focusMap(true);
    S.sortedPool = [S.target];
    S.poolIndex = 0;
    setTargetFromPool();
  }
}

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
 if (!localStorage.getItem('wq_geoapify_key')) {
   $('settingsPanel').classList.remove('hidden');
   toast("Please save your free API key first.");
   return;
 }

 $('startBtn').disabled=true;
 $('justWalkBtn').disabled=true;
 try{
  S.mode = mode;
  S.stop = 1;
  S.target = null;
  S.discovered = [];
  S.used = new Set();
  S.user = await pos();
  S.startLoc = {...S.user};
  $('home').classList.add('hidden');$('walk').classList.remove('hidden');

  if (S.mode === 'just_walk') {
     $('vibeLabel').textContent='JUST WALK';
     $('stopCountText').textContent='';
  } else {
     $('vibeLabel').textContent=cfg[S.vibe].label;
     $('stopCountText').textContent=`· STOP 1 / ${S.maxStops}`;
  }

  S.startedAt=Date.now();
  await initMap(S.user);
  userMarker(S.user);
  startLocationWatch();
  await mystery();
  $('startBtn').disabled=false;
  $('justWalkBtn').disabled=false;
 }catch(e){
  $('walk').classList.add('hidden');$('home').classList.remove('hidden');
  $('startBtn').disabled=false;$('justWalkBtn').disabled=false;
  toast(e.message);
 }
}

$('startBtn').onclick=()=>launchExperience('mystery');
$('justWalkBtn').onclick=()=>launchExperience('just_walk');

$('exitBtn').onclick=()=>{if(confirm('Leave this wander?'))location.reload()};
$('againBtn').onclick=()=>location.reload();
$('homeBtn').onclick=()=>location.reload();
