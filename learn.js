// ---------- Helpers ----------
function $(id) { return document.getElementById(id); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function unique(list) { return [...new Set(list)]; }

function flagUrl(code) { return `https://flagcdn.com/w320/${code}.png`; }

// ---------- State ----------
let DB = [];
let currentPool = [];
let pointer = 0;

// ---------- Elements ----------
const regionSelect = $("regionSelect");
const subregionSelect = $("subregionSelect");
const summaryBadge = $("summaryBadge");
const promptEl = $("prompt");
const flagImg = $("flagImg");
const flagHolder = $("flagHolder");
const countryNameEl = $("countryName");
const nextBtn = $("nextBtn");
const prevBtn = $("prevBtn");
const progressText = $("progressText");
const kidsToggle = $("kidsToggle");

// ---------- Load DB ----------
async function loadDB() {
  const res = await fetch("./data/countries.json");
  if (!res.ok) throw new Error("Failed to load countries.json");
  DB = await res.json();
}

// ---------- Selectors ----------
function buildLevelSelectors() {
  const regions = unique(DB.map(c => c.region)).sort();
  regionSelect.innerHTML = regions.map(r => `<option value="${r}">${r}</option>`).join("");
  regionSelect.addEventListener("change", () => populateSubregions(regionSelect.value));
  // initialize
  populateSubregions(regions[0]);
}

function populateSubregions(region) {
  const subs = unique(DB.filter(c => c.region === region).map(c => c.subregion)).sort();
  subregionSelect.innerHTML = subs.map(s => `<option value="${s}">${s}</option>`).join("");
  refreshPool();
}

// ---------- Pool ----------
function refreshPool() {
  const region = regionSelect.value;
  const subregion = subregionSelect.value;

  currentPool = DB.filter(c => c.region === region && c.subregion === subregion);
  currentPool = shuffle(currentPool);
  pointer = 0;

  summaryBadge.textContent = `${region} • ${subregion} — Available: ${currentPool.length} countries`;

  renderCurrent();
}

// ---------- Render ----------
function renderCurrent() {
  if (!currentPool.length) {
    promptEl.textContent = "No countries for this selection.";
    flagImg.src = "";
    flagImg.alt = "";
    countryNameEl.textContent = "—";
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    progressText.textContent = `0/0`;
    return;
  }

  nextBtn.disabled = false;
  prevBtn.disabled = false;
  const item = currentPool[pointer % currentPool.length];
  promptEl.textContent = "Flag and country:";
  flagHolder.classList.remove("hidden");
  flagImg.src = flagUrl(item.code);
  flagImg.alt = `Flag of ${item.name}`;
  countryNameEl.textContent = item.name;
  progressText.textContent = `${(pointer % currentPool.length) + 1}/${currentPool.length}`;
}

// ---------- Events ----------
nextBtn.addEventListener("click", () => {
  if (!currentPool.length) return;
  pointer = (pointer + 1) % currentPool.length;
  renderCurrent();
});

prevBtn.addEventListener("click", () => {
  if (!currentPool.length) return;
  pointer = (pointer - 1 + currentPool.length) % currentPool.length;
  renderCurrent();
});

kidsToggle.addEventListener("change", () => {
  if (kidsToggle.checked) {
    document.body.classList.add("full-mode");
  } else {
    document.body.classList.remove("full-mode");
  }
});

// ---------- Init ----------
(async function init() {
  try {
    await loadDB();
    buildLevelSelectors();
    subregionSelect.addEventListener("change", refreshPool);
    refreshPool();
  } catch (err) {
    console.error(err);
    alert("Error loading the learning page. Please serve this site via a local web server (not opening files directly). ");
  }
})();
