// ── Helpers ──
function $(id) { return document.getElementById(id); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function flagUrl(code) {
  return `https://flagcdn.com/w320/${code}.png`;
}

function unique(list) {
  return [...new Set(list)];
}

// ── State ──
let DB = [];
let CONFIG = {};
let currentPool = [];
let questions = [];
let qPointer = 0;
let score = 0;
let questionType = "flagToName";
let totalQuestions = 10;
let lastResults = [];
let selectedRegions = new Set();
let allRegionsMode = true;
let selectedSubregions = new Set();
let allSubregionsMode = true;

// ── Elements ──
const screens = {
  setup: $("screen-setup"),
  game: $("screen-game"),
  result: $("screen-result")
};

const regionToggleRow = $("regionToggleRow");
const subregionToggleRow = $("subregionToggleRow");
const startBtn = $("startBtn");
const quitBtn = $("quitBtn");
const nextBtn = $("nextBtn");

const qIndexEl = $("qIndex");
const qTotalEl = $("qTotal");
const scoreEl = $("score");
const progressBar = $("progressBar");

const promptEl = $("prompt");
const flagHolder = $("flagHolder");
const flagImg = $("flagImg");
const optionsEl = $("options");
const feedbackBar = $("feedbackBar");

const finalScoreEl = $("finalScore");
const finalTotalEl = $("finalTotal");
const trophyEmoji = $("trophyEmoji");
const resultHeading = $("resultHeading");
const resultLabel = $("resultLabel");
const reviewGrid = $("reviewGrid");

const playAgainBtn = $("playAgainBtn");
const fxLayer = $("fxLayer");

// ── Screen control ──
function showScreen(which) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[which].classList.remove("hidden");
}

const STORAGE_KEY = "geobasics_flags_config";

// ── Load data ──
async function loadData() {
  const [countriesRes, configRes] = await Promise.all([
    fetch("./data/countries.json"),
    fetch("./data/flags-config.json")
  ]);
  if (!countriesRes.ok) throw new Error("Failed to load countries.json");
  if (!configRes.ok) throw new Error("Failed to load flags-config.json");

  DB = await countriesRes.json();
  CONFIG = await configRes.json();
}

// ── Read enabled country codes from localStorage (or fall back to config file) ──
function getIncludedCodes() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.included)) {
        return new Set(parsed.included);
      }
    } catch { /* fall through */ }
  }
  return new Set(CONFIG.included || []);
}

// ── Setup UI ──
function buildRegionToggles() {
  const includedCodes = getIncludedCodes();
  const regions = unique(DB.filter(c => includedCodes.has(c.code)).map(c => c.region)).sort();

  selectedRegions = new Set();
  allRegionsMode = true;
  regionToggleRow.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "region-chip chip-all active";
  allChip.textContent = "🌍 All Regions";
  allChip.addEventListener("click", () => {
    allRegionsMode = true;
    selectedRegions.clear();
    refreshRegionChipStates();
    buildSubregionToggles();
  });
  regionToggleRow.appendChild(allChip);

  regions.forEach(region => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "region-chip";
    chip.textContent = region;
    chip.dataset.region = region;
    chip.addEventListener("click", () => {
      allRegionsMode = false;
      if (selectedRegions.has(region)) {
        selectedRegions.delete(region);
      } else {
        selectedRegions.add(region);
      }
      if (selectedRegions.size === 0) allRegionsMode = true;
      refreshRegionChipStates();
      buildSubregionToggles();
    });
    regionToggleRow.appendChild(chip);
  });

  buildSubregionToggles();
}

function refreshRegionChipStates() {
  [...regionToggleRow.children].forEach(chip => {
    if (chip.classList.contains("chip-all")) {
      chip.classList.toggle("active", allRegionsMode);
    } else {
      chip.classList.toggle("active", !allRegionsMode && selectedRegions.has(chip.dataset.region));
    }
  });
}

// Sub-region chips depend on which regions are currently active, so they're rebuilt
// (and reset to "All") every time the region selection changes.
function buildSubregionToggles() {
  const includedCodes = getIncludedCodes();
  const activeCountries = DB.filter(c =>
    includedCodes.has(c.code) && (allRegionsMode || selectedRegions.has(c.region))
  );
  const subregions = unique(activeCountries.map(c => c.subregion)).sort();

  selectedSubregions = new Set();
  allSubregionsMode = true;
  subregionToggleRow.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "region-chip chip-all active";
  allChip.textContent = "🗺️ All Sub-regions";
  allChip.addEventListener("click", () => {
    allSubregionsMode = true;
    selectedSubregions.clear();
    refreshSubregionChipStates();
  });
  subregionToggleRow.appendChild(allChip);

  subregions.forEach(subregion => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "region-chip";
    chip.textContent = subregion;
    chip.dataset.subregion = subregion;
    chip.addEventListener("click", () => {
      allSubregionsMode = false;
      if (selectedSubregions.has(subregion)) {
        selectedSubregions.delete(subregion);
      } else {
        selectedSubregions.add(subregion);
      }
      if (selectedSubregions.size === 0) allSubregionsMode = true;
      refreshSubregionChipStates();
    });
    subregionToggleRow.appendChild(chip);
  });
}

function refreshSubregionChipStates() {
  [...subregionToggleRow.children].forEach(chip => {
    if (chip.classList.contains("chip-all")) {
      chip.classList.toggle("active", allSubregionsMode);
    } else {
      chip.classList.toggle("active", !allSubregionsMode && selectedSubregions.has(chip.dataset.subregion));
    }
  });
}

function setupModeCards() {
  const cards = document.querySelectorAll(".mode-card");
  cards.forEach(card => {
    card.addEventListener("click", () => {
      cards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      questionType = card.dataset.type;
    });
  });
}

function setupQCountButtons() {
  const btns = document.querySelectorAll(".q-count-btn");
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      totalQuestions = parseInt(btn.dataset.n, 10);
    });
  });
}

// ── Question generation ──
function buildQuestions(pool, n) {
  const shuffled = shuffle(pool);
  return shuffled.slice(0, Math.min(n, shuffled.length)).map(country => ({ correct: country }));
}

function buildNameOptions(pool, correctName, k = 4) {
  const others = shuffle(pool.filter(c => c.name !== correctName)).slice(0, k - 1).map(c => c.name);
  return shuffle([correctName, ...others]);
}

function buildFlagOptions(pool, correctCode, k = 4) {
  const others = shuffle(pool.filter(c => c.code !== correctCode)).slice(0, k - 1).map(c => c.code);
  return shuffle([correctCode, ...others]);
}

// ── Game flow ──
function startGame() {
  // Always re-read config at game start so the latest saved settings are applied
  const includedCodes = getIncludedCodes();
  const enabledDB = DB.filter(c => includedCodes.has(c.code));

  currentPool = enabledDB.filter(c =>
    (allRegionsMode || selectedRegions.has(c.region)) &&
    (allSubregionsMode || selectedSubregions.has(c.subregion))
  );

  if (currentPool.length < 4) {
    alert("Not enough countries in the selected region(s)/sub-region(s) (need at least 4). Please choose different options.");
    return;
  }

  questions = buildQuestions(currentPool, totalQuestions);
  qPointer = 0;
  score = 0;
  lastResults = [];

  qTotalEl.textContent = questions.length;
  scoreEl.textContent = "0";

  showScreen("game");
  renderQuestion();
}

function renderQuestion() {
  feedbackBar.classList.add("hidden");
  nextBtn.classList.add("hidden");
  optionsEl.innerHTML = "";

  const q = questions[qPointer];
  const correct = q.correct;

  qIndexEl.textContent = qPointer + 1;
  scoreEl.textContent = score;
  progressBar.style.width = `${(qPointer / questions.length) * 100}%`;

  if (questionType === "flagToName") {
    promptEl.textContent = "Which country has this flag? 🤔";
    flagImg.src = flagUrl(correct.code);
    flagImg.alt = `Flag of ${correct.name}`;
    flagHolder.classList.remove("hidden");
    renderNameOptions(correct);
  } else {
    promptEl.textContent = `Pick the flag of: ${correct.name} 🏳️`;
    flagHolder.classList.add("hidden");
    renderFlagOptions(correct);
  }
}

function renderNameOptions(correct) {
  const names = buildNameOptions(currentPool, correct.name, 4);
  optionsEl.className = "options-name";
  names.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = name;
    btn.addEventListener("click", () => checkAnswer(btn, name === correct.name, correct));
    optionsEl.appendChild(btn);
  });
}

function renderFlagOptions(correct) {
  const codes = buildFlagOptions(currentPool, correct.code, 4);
  optionsEl.className = "options-flag";
  codes.forEach(code => {
    const btn = document.createElement("button");
    btn.className = "option-btn flag-opt";
    btn.dataset.code = code;
    btn.innerHTML = `<img src="${flagUrl(code)}" alt="Flag option" />`;
    btn.addEventListener("click", () => checkAnswer(btn, code === correct.code, correct));
    optionsEl.appendChild(btn);
  });
}

function checkAnswer(clickedBtn, isCorrect, correct) {
  // Lock all buttons
  [...optionsEl.querySelectorAll("button")].forEach(b => {
    b.disabled = true;
  });

  // Mark correct/wrong visually
  clickedBtn.classList.add(isCorrect ? "correct" : "wrong");

  // If wrong, also highlight the correct answer
  if (!isCorrect) {
    if (questionType === "flagToName") {
      [...optionsEl.querySelectorAll("button")].forEach(b => {
        if (b.textContent === correct.name) b.classList.add("correct");
      });
    } else {
      [...optionsEl.querySelectorAll("button")].forEach(b => {
        if (b.dataset.code === correct.code) b.classList.add("correct");
      });
    }
  }

  if (isCorrect) score++;

  // Feedback bar
  feedbackBar.className = "feedback-bar " + (isCorrect ? "good" : "bad");
  feedbackBar.textContent = isCorrect
    ? `✅ Correct! That's ${correct.name}!`
    : `❌ Not quite! The answer is ${correct.name}.`;
  feedbackBar.classList.remove("hidden");

  // Confetti
  spawnConfetti(isCorrect);

  // Save result
  lastResults.push({
    correctName: correct.name,
    correctCode: correct.code,
    region: correct.region,
    subregion: correct.subregion,
    wasCorrect: isCorrect
  });

  scoreEl.textContent = score;
  nextBtn.classList.remove("hidden");
}

function nextQuestion() {
  qPointer++;
  if (qPointer >= questions.length) {
    endGame();
  } else {
    renderQuestion();
  }
}

function endGame() {
  progressBar.style.width = "100%";
  showScreen("result");

  finalScoreEl.textContent = score;
  finalTotalEl.textContent = questions.length;

  const pct = score / questions.length;
  if (pct === 1) {
    trophyEmoji.textContent = "🏆";
    resultHeading.textContent = "Perfect score!";
    resultLabel.textContent = "Amazing! You got every single one!";
  } else if (pct >= 0.7) {
    trophyEmoji.textContent = "🌟";
    resultHeading.textContent = "Great job!";
    resultLabel.textContent = "You're really good at this!";
  } else if (pct >= 0.4) {
    trophyEmoji.textContent = "👍";
    resultHeading.textContent = "Good effort!";
    resultLabel.textContent = "Keep practising and you'll get there!";
  } else {
    trophyEmoji.textContent = "📚";
    resultHeading.textContent = "Keep learning!";
    resultLabel.textContent = "Try again – you'll do better next time!";
  }

  reviewGrid.innerHTML = "";
  lastResults.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "review-item " + (r.wasCorrect ? "correct" : "wrong");
    div.innerHTML = `
      <img src="${flagUrl(r.correctCode)}" alt="Flag of ${r.correctName}" />
      <div class="review-item-info">
        <div class="review-item-name">${r.correctName}</div>
        <div class="review-item-sub">${r.region} · ${r.subregion}</div>
      </div>
      <div class="review-mark">${r.wasCorrect ? "✅" : "❌"}</div>
    `;
    reviewGrid.appendChild(div);
  });
}

// ── Confetti FX ──
const CONFETTI_COLORS = {
  good: ["#4ade80", "#86efac", "#22c55e", "#bbf7d0", "#6ee7b7"],
  bad:  ["#f87171", "#fca5a5", "#ef4444", "#fecaca", "#fb923c"]
};

function spawnConfetti(isCorrect) {
  const colors = isCorrect ? CONFETTI_COLORS.good : CONFETTI_COLORS.bad;
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = `${8 + Math.random() * 6}px`;
    piece.style.height = `${12 + Math.random() * 6}px`;
    piece.style.setProperty("--dur", `${1.4 + Math.random() * 0.8}s`);
    piece.style.setProperty("--dx", `${Math.random() * 120 - 60}px`);
    fxLayer.appendChild(piece);
    setTimeout(() => piece.remove(), 2400);
  }
}

// ── Events ──
startBtn.addEventListener("click", startGame);
quitBtn.addEventListener("click", () => showScreen("setup"));
nextBtn.addEventListener("click", nextQuestion);
playAgainBtn.addEventListener("click", () => {
  showScreen("game");
  startGame();
});

// ── Init ──
(async function init() {
  try {
    await loadData();
    buildRegionToggles();
    setupModeCards();
    setupQCountButtons();
    showScreen("setup");
  } catch (err) {
    console.error(err);
    alert("Could not load game data. Make sure you're serving this via a web server (not opening the file directly).");
  }
})();
