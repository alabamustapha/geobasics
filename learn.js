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

// ---------- Progression config ----------
const PROGRESS_KEY = "geobasics_learn_progress";
const CONFIG_STORAGE_KEY = "geobasics_flags_config";
const START_UNLOCKED = 2;   // countries unlocked at the start of a new region/subregion
const QUIZ_LENGTH = 10;     // questions per quiz round
const MAX_OPTIONS = 4;      // multiple-choice options, capped by how many countries are unlocked

// ---------- State ----------
let DB = [];
let CONFIG = {};
let learnProgress = {};   // { "regions::subregions": unlockedCount }
let scopeKey = "";
let scopePool = [];        // all countries in the chosen scope, sorted (unlock order)
let unlockedCount = START_UNLOCKED;
let studyPool = [];        // shuffled unlocked slice, used for flashcard browsing
let pointer = 0;

let selectedRegions = new Set();
let allRegionsMode = true;
let selectedSubregions = new Set();
let allSubregionsMode = true;

let quizQuestions = [];
let quizPointer = 0;
let quizScore = 0;

// ---------- Elements ----------
const regionToggleRow = $("learnRegionToggleRow");
const subregionToggleRow = $("learnSubregionToggleRow");
const summaryBadge = $("summaryBadge");
const progressBadge = $("progressBadge");
const promptEl = $("prompt");
const flagImg = $("flagImg");
const flagHolder = $("flagHolder");
const countryNameEl = $("countryName");
const nextBtn = $("nextBtn");
const prevBtn = $("prevBtn");
const progressText = $("progressText");
const kidsToggle = $("kidsToggle");
const quizBtn = $("quizBtn");

const screenStudy = $("screen-study");
const screenQuiz = $("screen-quiz");
const screenQuizResult = $("screen-quizResult");

const quizIndexEl = $("quizIndex");
const quizTotalEl = $("quizTotal");
const quizScoreEl = $("quizScore");
const quizProgressBar = $("quizProgressBar");
const quizPromptEl = $("quizPrompt");
const quizFlagImg = $("quizFlagImg");
const quizOptionsEl = $("quizOptions");
const quizFeedback = $("quizFeedback");
const quizNextBtn = $("quizNextBtn");
const quizQuitBtn = $("quizQuitBtn");

const quizTrophy = $("quizTrophy");
const quizResultHeading = $("quizResultHeading");
const quizFinalScore = $("quizFinalScore");
const quizFinalTotal = $("quizFinalTotal");
const quizResultLabel = $("quizResultLabel");
const quizContinueBtn = $("quizContinueBtn");

const fxLayer = $("fxLayer");

// ---------- Progress storage ----------
function loadProgress() {
  try {
    learnProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    learnProgress = {};
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(learnProgress));
}

// ---------- Load DB ----------
async function loadDB() {
  const [countriesRes, configRes] = await Promise.all([
    fetch("./data/countries.json"),
    fetch("./data/flags-config.json")
  ]);
  if (!countriesRes.ok) throw new Error("Failed to load countries.json");
  if (!configRes.ok) throw new Error("Failed to load flags-config.json");
  DB = await countriesRes.json();
  CONFIG = await configRes.json();
}

// ---------- Read enabled country codes from localStorage (or fall back to config file) ----------
function getIncludedCodes() {
  const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
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

// ---------- Selectors (multi-select region/sub-region chips) ----------
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

// Sub-region chips depend on which regions are active, so they're rebuilt
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
    refreshScope();
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
      refreshScope();
    });
    subregionToggleRow.appendChild(chip);
  });

  refreshScope();
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

// ---------- Scope / unlock progress ----------
function refreshScope() {
  const regionsPart = allRegionsMode ? "ALL" : [...selectedRegions].sort().join(",");
  const subregionsPart = allSubregionsMode ? "ALL" : [...selectedSubregions].sort().join(",");
  scopeKey = `${regionsPart}::${subregionsPart}`;

  const includedCodes = getIncludedCodes();
  // Sorted (not shuffled) so "unlock the next country" is a stable, deterministic order.
  scopePool = DB.filter(c =>
    includedCodes.has(c.code) &&
    (allRegionsMode || selectedRegions.has(c.region)) &&
    (allSubregionsMode || selectedSubregions.has(c.subregion))
  ).sort((a, b) => a.name.localeCompare(b.name));

  if (scopePool.length === 0) {
    unlockedCount = 0;
  } else {
    const saved = learnProgress[scopeKey];
    unlockedCount = Math.max(1, Math.min(saved || START_UNLOCKED, scopePool.length));
  }

  const regionsLabel = allRegionsMode ? "All Regions" : [...selectedRegions].join(", ");
  const subregionsLabel = allSubregionsMode ? "All Sub-regions" : [...selectedSubregions].join(", ");
  summaryBadge.textContent = `${regionsLabel} • ${subregionsLabel} — ${scopePool.length} countries`;
  updateProgressBadge();

  refreshStudyPool();
  showStudyScreen();
}

function updateProgressBadge() {
  progressBadge.textContent = `🔓 Learned ${unlockedCount} of ${scopePool.length}`;
}

function unlockedSlice() {
  return scopePool.slice(0, unlockedCount);
}

// ---------- Study (flashcards over the unlocked slice) ----------
function refreshStudyPool() {
  studyPool = shuffle(unlockedSlice());
  pointer = 0;
  renderCurrent();
}

function renderCurrent() {
  if (!studyPool.length) {
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
  const item = studyPool[pointer % studyPool.length];
  promptEl.textContent = "Flag and country:";
  flagHolder.classList.remove("hidden");
  flagImg.src = flagUrl(item.code);
  flagImg.alt = `Flag of ${item.name}`;
  countryNameEl.textContent = item.name;
  progressText.textContent = `${(pointer % studyPool.length) + 1}/${studyPool.length}`;
}

// ---------- Screen control ----------
function setPickersEnabled(enabled) {
  [...regionToggleRow.children, ...subregionToggleRow.children].forEach(chip => {
    chip.disabled = !enabled;
  });
}

function showStudyScreen() {
  screenStudy.classList.remove("hidden");
  screenQuiz.classList.add("hidden");
  screenQuizResult.classList.add("hidden");
  setPickersEnabled(true);
}

function showQuizScreen() {
  screenStudy.classList.add("hidden");
  screenQuiz.classList.remove("hidden");
  screenQuizResult.classList.add("hidden");
  setPickersEnabled(false);
}

function showQuizResultScreen() {
  screenStudy.classList.add("hidden");
  screenQuiz.classList.add("hidden");
  screenQuizResult.classList.remove("hidden");
}

// ---------- Quiz ----------
function buildQuizQuestions() {
  const pool = unlockedSlice();
  const questions = [];
  let lastCode = null;
  // Repeats through the unlocked pool (shuffled each pass) until QUIZ_LENGTH is reached,
  // since the pool can be smaller than the quiz length early on.
  while (questions.length < QUIZ_LENGTH) {
    for (const c of shuffle(pool)) {
      if (questions.length >= QUIZ_LENGTH) break;
      if (c.code === lastCode && pool.length > 1) continue;
      questions.push(c);
      lastCode = c.code;
    }
  }
  return questions;
}

function buildNameOptions(pool, correctName, k) {
  const others = shuffle(pool.filter(c => c.name !== correctName)).slice(0, k - 1).map(c => c.name);
  return shuffle([correctName, ...others]);
}

function startQuiz() {
  if (!unlockedSlice().length) return;
  quizQuestions = buildQuizQuestions();
  quizPointer = 0;
  quizScore = 0;
  quizTotalEl.textContent = quizQuestions.length;
  showQuizScreen();
  renderQuizQuestion();
}

function renderQuizQuestion() {
  quizFeedback.classList.add("hidden");
  quizNextBtn.classList.add("hidden");
  quizOptionsEl.innerHTML = "";

  const correct = quizQuestions[quizPointer];
  const pool = unlockedSlice();
  const k = Math.min(MAX_OPTIONS, pool.length);

  quizIndexEl.textContent = quizPointer + 1;
  quizScoreEl.textContent = quizScore;
  quizProgressBar.style.width = `${(quizPointer / quizQuestions.length) * 100}%`;

  quizPromptEl.textContent = "Which country has this flag? 🤔";
  quizFlagImg.src = flagUrl(correct.code);
  quizFlagImg.alt = `Flag of ${correct.name}`;

  const names = buildNameOptions(pool, correct.name, k);
  names.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = name;
    btn.addEventListener("click", () => checkQuizAnswer(btn, name === correct.name, correct));
    quizOptionsEl.appendChild(btn);
  });
}

function checkQuizAnswer(clickedBtn, isCorrect, correct) {
  [...quizOptionsEl.querySelectorAll("button")].forEach(b => { b.disabled = true; });
  clickedBtn.classList.add(isCorrect ? "correct" : "wrong");

  if (!isCorrect) {
    [...quizOptionsEl.querySelectorAll("button")].forEach(b => {
      if (b.textContent === correct.name) b.classList.add("correct");
    });
  }

  if (isCorrect) quizScore++;

  quizFeedback.className = "feedback-bar " + (isCorrect ? "good" : "bad");
  quizFeedback.textContent = isCorrect
    ? `✅ Correct! That's ${correct.name}!`
    : `❌ Not quite! The answer is ${correct.name}.`;
  quizFeedback.classList.remove("hidden");

  spawnConfetti(isCorrect);

  quizScoreEl.textContent = quizScore;
  quizNextBtn.classList.remove("hidden");
}

function nextQuizQuestion() {
  quizPointer++;
  if (quizPointer >= quizQuestions.length) {
    endQuiz();
  } else {
    renderQuizQuestion();
  }
}

function endQuiz() {
  quizProgressBar.style.width = "100%";

  const perfect = quizScore === quizQuestions.length;
  quizFinalScore.textContent = quizScore;
  quizFinalTotal.textContent = quizQuestions.length;

  if (perfect && unlockedCount < scopePool.length) {
    const unlocked = scopePool[unlockedCount]; // next country in unlock order
    unlockedCount++;
    learnProgress[scopeKey] = unlockedCount;
    saveProgress();
    updateProgressBadge();

    quizTrophy.textContent = "🎉";
    quizResultHeading.textContent = "Perfect! New country unlocked!";
    quizResultLabel.textContent = `You unlocked ${unlocked.name}! Keep going!`;
    quizContinueBtn.textContent = "Keep Learning! 📚";
  } else if (perfect) {
    quizTrophy.textContent = "🏆";
    quizResultHeading.textContent = "You mastered this region!";
    quizResultLabel.textContent = "You know every country here. Amazing!";
    quizContinueBtn.textContent = "Back to Studying";
  } else {
    quizTrophy.textContent = "📚";
    quizResultHeading.textContent = "Good try!";
    quizResultLabel.textContent = "Get every question right to unlock a new country. Try again!";
    quizContinueBtn.textContent = "Keep Practicing";
  }

  showQuizResultScreen();
}

// ---------- Confetti FX ----------
const CONFETTI_COLORS = {
  good: ["#4ade80", "#86efac", "#22c55e", "#bbf7d0", "#6ee7b7"],
  bad:  ["#f87171", "#fca5a5", "#ef4444", "#fecaca", "#fb923c"]
};

function spawnConfetti(isCorrect) {
  const colors = isCorrect ? CONFETTI_COLORS.good : CONFETTI_COLORS.bad;
  const count = isCorrect ? 40 : 16;
  for (let i = 0; i < count; i++) {
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

// ---------- Events ----------
nextBtn.addEventListener("click", () => {
  if (!studyPool.length) return;
  pointer = (pointer + 1) % studyPool.length;
  renderCurrent();
});

prevBtn.addEventListener("click", () => {
  if (!studyPool.length) return;
  pointer = (pointer - 1 + studyPool.length) % studyPool.length;
  renderCurrent();
});

kidsToggle.addEventListener("change", () => {
  document.body.classList.toggle("full-mode", kidsToggle.checked);
});

quizBtn.addEventListener("click", startQuiz);
quizNextBtn.addEventListener("click", nextQuizQuestion);
quizQuitBtn.addEventListener("click", showStudyScreen);
quizContinueBtn.addEventListener("click", () => {
  refreshStudyPool();
  showStudyScreen();
});

// ---------- Init ----------
(async function init() {
  try {
    loadProgress();
    await loadDB();
    buildRegionToggles();
  } catch (err) {
    console.error(err);
    alert("Error loading the learning page. Please serve this site via a local web server (not opening files directly).");
  }
})();
