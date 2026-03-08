const STORAGE_KEY = "geobasics_flags_config";

// ── State ──
let allCountries = [];    // full list from countries.json
let defaultConfig = {};   // flags-config.json defaults
let enabledSet = new Set(); // currently enabled country codes
let activeRegion    = "__ALL__";
let activeSubregion = "__ALL__";

// ── Elements ──
const countryList      = document.getElementById("countryList");
const regionFilter     = document.getElementById("regionFilter");
const subregionFilter  = document.getElementById("subregionFilter");
const configStats      = document.getElementById("configStats");
const allOnBtn      = document.getElementById("allOnBtn");
const allOffBtn     = document.getElementById("allOffBtn");
const saveBtn       = document.getElementById("saveBtn");
const exportBtn     = document.getElementById("exportBtn");
const importInput   = document.getElementById("importInput");
const resetBtn      = document.getElementById("resetBtn");
const toast         = document.getElementById("toast");

// ── Toast ──
let toastTimer;
function showToast(msg, type = "info") {
  toast.textContent = msg;
  toast.className = "toast show toast-" + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ── Load ──
async function loadData() {
  const [countriesRes, configRes] = await Promise.all([
    fetch("./data/countries.json"),
    fetch("./data/flags-config.json")
  ]);
  allCountries = await countriesRes.json();
  defaultConfig = await configRes.json();

  // Load from localStorage, or fall back to defaults
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      enabledSet = new Set(parsed.included || []);
    } catch {
      enabledSet = new Set(defaultConfig.included || []);
    }
  } else {
    enabledSet = new Set(defaultConfig.included || []);
  }
}

// ── Build region filter ──
function buildRegionFilter() {
  const regions = [...new Set(allCountries.map(c => c.region))].sort();
  regions.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    regionFilter.appendChild(opt);
  });
}

// ── Populate sub-region filter based on active region ──
function populateSubregionFilter() {
  const source = activeRegion === "__ALL__"
    ? allCountries
    : allCountries.filter(c => c.region === activeRegion);

  const subs = [...new Set(source.map(c => c.subregion))].sort();

  subregionFilter.innerHTML = `<option value="__ALL__">All Sub-regions</option>`;
  subs.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    subregionFilter.appendChild(opt);
  });

  // Reset sub-region selection when region changes
  activeSubregion = "__ALL__";
  subregionFilter.value = "__ALL__";
}

// ── Filtered country list ──
function filteredCountries() {
  return allCountries.filter(c => {
    const regionMatch    = activeRegion    === "__ALL__" || c.region    === activeRegion;
    const subregionMatch = activeSubregion === "__ALL__" || c.subregion === activeSubregion;
    return regionMatch && subregionMatch;
  });
}

// ── Render list ──
function renderList() {
  const countries = filteredCountries();
  countryList.innerHTML = "";

  countries.forEach(c => {
    const enabled = enabledSet.has(c.code);
    const row = document.createElement("div");
    row.className = "country-row" + (enabled ? "" : " country-row-off");

    const img = document.createElement("img");
    img.src = `https://flagcdn.com/w80/${c.code}.png`;
    img.alt = `${c.name} flag`;
    img.className = "country-flag-thumb";
    img.loading = "lazy";

    const info = document.createElement("div");
    info.className = "country-info";
    info.innerHTML = `<span class="country-name">${c.name}</span><span class="country-sub">${c.subregion}</span>`;

    const label = document.createElement("label");
    label.className = "toggle-switch";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabled;
    checkbox.dataset.code = c.code;

    const slider = document.createElement("span");
    slider.className = "toggle-slider";

    label.appendChild(checkbox);
    label.appendChild(slider);
    row.appendChild(img);
    row.appendChild(info);
    row.appendChild(label);
    countryList.appendChild(row);
  });

  updateStats();
}

// ── Single delegated listener for all toggle changes ──
countryList.addEventListener("change", e => {
  if (e.target.type !== "checkbox") return;
  const code = e.target.dataset.code;
  const row  = e.target.closest(".country-row");
  if (e.target.checked) {
    enabledSet.add(code);
    row.classList.remove("country-row-off");
  } else {
    enabledSet.delete(code);
    row.classList.add("country-row-off");
  }
  markUnsaved();
  updateStats();
});

// ── Stats ──
function updateStats() {
  const countries = filteredCountries();
  const enabledCount = countries.filter(c => enabledSet.has(c.code)).length;
  const totalCount   = countries.length;

  let scope = "total";
  if (activeSubregion !== "__ALL__") scope = activeSubregion;
  else if (activeRegion !== "__ALL__") scope = activeRegion;

  configStats.textContent = `${enabledCount} of ${totalCount} countries enabled (${scope})`;
  configStats.className = "config-stats" + (enabledCount === 0 ? " config-stats-warn" : "");
}

// ── Unsaved indicator ──
function markUnsaved() {
  saveBtn.textContent = "💾 Save*";
  saveBtn.classList.add("btn-save-dirty");
}

function markSaved() {
  saveBtn.textContent = "💾 Save";
  saveBtn.classList.remove("btn-save-dirty");
}

// ── Bulk actions ──
function setAllFiltered(enabled) {
  filteredCountries().forEach(c => {
    if (enabled) enabledSet.add(c.code);
    else enabledSet.delete(c.code);
  });
  markUnsaved();
  renderList();
  showToast(enabled ? "All turned on ✅" : "All turned off ❌");
}

// ── Persist ──
function saveToStorage() {
  const payload = { included: [...enabledSet] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

// ── Export ──
function exportConfig() {
  const payload = {
    _comment: defaultConfig._comment || "Flags game configuration.",
    settings: defaultConfig.settings || {},
    included: [...enabledSet].sort()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "flags-config.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported flags-config.json ⬇", "info");
}

// ── Import ──
function importConfig(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed.included)) throw new Error("Missing 'included' array");
      enabledSet = new Set(parsed.included);
      saveToStorage();
      markSaved();
      renderList();
      showToast("Config imported ✅", "good");
    } catch {
      showToast("Invalid JSON file ❌", "bad");
    }
  };
  reader.readAsText(file);
}

// ── Reset ──
function resetToDefaults() {
  if (!confirm("Reset to the default configuration? This cannot be undone.")) return;
  enabledSet = new Set(defaultConfig.included || []);
  saveToStorage();
  markSaved();
  renderList();
  showToast("Reset to defaults ↩");
}

// ── Events ──
saveBtn.addEventListener("click", () => {
  saveToStorage();
  markSaved();
  showToast("Saved! 💾");
});

allOnBtn.addEventListener("click", () => setAllFiltered(true));
allOffBtn.addEventListener("click", () => setAllFiltered(false));
exportBtn.addEventListener("click", exportConfig);
resetBtn.addEventListener("click", resetToDefaults);

importInput.addEventListener("change", () => {
  if (importInput.files[0]) importConfig(importInput.files[0]);
  importInput.value = ""; // allow re-importing same file
});

regionFilter.addEventListener("change", () => {
  activeRegion = regionFilter.value;
  populateSubregionFilter();
  renderList();
});

subregionFilter.addEventListener("change", () => {
  activeSubregion = subregionFilter.value;
  renderList();
});

// ── Init ──
(async function init() {
  try {
    await loadData();
    buildRegionFilter();
    populateSubregionFilter();
    renderList();
  } catch (err) {
    console.error(err);
    countryList.innerHTML = `<p style="color:red">Failed to load data. Serve this site via a web server.</p>`;
  }
})();
