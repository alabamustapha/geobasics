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

function normalize(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function flagUrl(code) {
  // Uses a free public CDN. Good for GitHub Pages demos.
  return `https://flagcdn.com/w320/${code}.png`;
}

function unique(list) {
  return [...new Set(list)];
}

// ---------- State ----------
let DB = [];
let currentPool = [];
let questions = [];
let qPointer = 0;
let score = 0;

let answerMode = "mcq";        // "mcq" | "input"
let questionType = "flagToName"; // "flagToName" | "nameToFlag"
let totalQuestions = 10;

let lastResults = []; // review at the end

// ---------- Elements ----------
const screens = {
  menu: $("screen-menu"),
  game: $("screen-game"),
  result: $("screen-result")
};

const regionSelect = $("regionSelect");
const subregionSelect = $("subregionSelect");
const numQuestionsSelect = $("numQuestions");

const startBtn = $("startBtn");
const quitBtn = $("quitBtn");
const nextBtn = $("nextBtn");

const levelLabel = $("levelLabel");
const modeLabel = $("modeLabel");

const scoreEl = $("score");
const qIndexEl = $("qIndex");
const qTotalEl = $("qTotal");

const promptEl = $("prompt");
const flagImg = $("flagImg");
const flagHolder = $("flagHolder");

const answerForm = $("answerForm");
const answerInput = $("answerInput");

const optionsEl = $("options");

const feedbackText = $("feedbackText");

const finalScoreEl = $("finalScore");
const finalTotalEl = $("finalTotal");
const reviewEl = $("review");

const playAgainBtn = $("playAgainBtn");
const backToMenuBtn = $("backToMenuBtn");

// ---------- Load DB ----------
async function loadDB() {
  const res = await fetch("./data/countries.json");
  if (!res.ok) throw new Error("Failed to load countries.json");
  DB = await res.json();
}

// ---------- Build Region/Subregion selects ----------
function buildLevelSelectors() {
  const regions = unique(DB.map(c => c.region)).sort();
  regionSelect.innerHTML = regions.map(r => `<option value="${r}">${r}</option>`).join("");

  regionSelect.addEventListener("change", () => {
    populateSubregions(regionSelect.value);
  });

  populateSubregions(regionSelect.value || regions[0]);
}

function populateSubregions(region) {
  const subs = unique(DB.filter(c => c.region === region).map(c => c.subregion)).sort();
  subregionSelect.innerHTML = subs.map(s => `<option value="${s}">${s}</option>`).join("");
}

// ---------- Read radio selection ----------
function getRadio(name) {
  return [...document.querySelectorAll(`input[name="${name}"]`)]
    .find(r => r.checked)?.value;
}

// ---------- Question generation ----------
function buildQuestions(pool, n) {
  const shuffled = shuffle(pool);
  const picked = shuffled.slice(0, Math.min(n, shuffled.length));
  return picked.map(country => ({
    correct: country,
    // We'll create options on-demand
  }));
}

function buildNameOptions(pool, correctName, k = 4) {
  const others = shuffle(pool.filter(c => c.name !== correctName)).slice(0, k - 1).map(c => c.name);
  return shuffle([correctName, ...others]);
}

function buildFlagOptions(pool, correctCode, k = 4) {
  const others = shuffle(pool.filter(c => c.code !== correctCode)).slice(0, k - 1).map(c => c.code);
  return shuffle([correctCode, ...others]);
}

// ---------- UI control ----------
function showScreen(which) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[which].classList.remove("hidden");
}

function setFeedback(text, kind) {
  feedbackText.textContent = text;
  feedbackText.classList.remove("good", "bad");
  if (kind) feedbackText.classList.add(kind);
}

// ---------- Game flow ----------
function startGame() {
  // read settings
  answerMode = getRadio("answerMode") || "mcq";
  questionType = getRadio("questionType") || "flagToName";
  totalQuestions = parseInt(numQuestionsSelect.value, 10) || 10;

  const region = regionSelect.value;
  const subregion = subregionSelect.value;

  currentPool = DB.filter(c => c.region === region && c.subregion === subregion);

  if (currentPool.length < 2) {
    alert("Not enough countries in this level. Please add more in data/countries.json.");
    return;
  }

  questions = buildQuestions(currentPool, totalQuestions);
  qPointer = 0;
  score = 0;
  lastResults = [];

  scoreEl.textContent = String(score);
  qTotalEl.textContent = String(questions.length);
  qIndexEl.textContent = String(qPointer + 1);

  levelLabel.textContent = `${region} • ${subregion}`;
  modeLabel.textContent =
    `${answerMode === "mcq" ? "Options" : "Type"} • ${questionType === "flagToName" ? "Flag→Name" : "Name→Flag"}`;

  showScreen("game");
  renderQuestion();
}

function renderQuestion() {
  setFeedback("", null);
  nextBtn.classList.add("hidden");
  optionsEl.innerHTML = "";

  // show correct answer is not allowed until answered
  const q = questions[qPointer];
  const correct = q.correct;

  qIndexEl.textContent = String(qPointer + 1);
  scoreEl.textContent = String(score);

  // Decide what we show:
  if (questionType === "flagToName") {
    promptEl.textContent = "Which country has this flag?";
    flagImg.src = flagUrl(correct.code);
    flagImg.alt = `Flag of ${correct.name}`;
    flagHolder.classList.remove("hidden");
  } else {
    promptEl.textContent = `Pick the flag of: ${correct.name}`;
    // We'll show a blank placeholder image area (optional)
    flagHolder.classList.remove("hidden");
    flagImg.src = "";
    flagImg.alt = "Choose the correct flag below";
  }

  // Answer mode
  if (answerMode === "input") {
    optionsEl.classList.add("hidden");
    answerForm.classList.remove("hidden");
    answerInput.value = "";
    answerInput.focus();
  } else {
    answerForm.classList.add("hidden");
    optionsEl.classList.remove("hidden");
    renderOptions(correct);
  }
}

function renderOptions(correct) {
  // MCQ options depend on questionType
  if (questionType === "flagToName") {
    const names = buildNameOptions(currentPool, correct.name, 4);
    names.forEach(name => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.type = "button";
      btn.textContent = name;
      btn.addEventListener("click", () => checkAnswer({ pickedName: name }));
      optionsEl.appendChild(btn);
    });
    flagHolder.classList.remove("hidden");
    flagImg.src = flagUrl(correct.code);
  } else {
    // nameToFlag: show multiple flags as options
    const codes = buildFlagOptions(currentPool, correct.code, 4);
    optionsEl.classList.add("options");
    codes.forEach(code => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.type = "button";
      btn.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
          <img src="${flagUrl(code)}" alt="Flag option" style="width:100%;border-radius:10px;border:1px solid rgba(255,255,255,.08);" />
          <div style="opacity:.9;font-size:13px;">Select</div>
        </div>
      `;
      btn.addEventListener("click", () => checkAnswer({ pickedCode: code }));
      optionsEl.appendChild(btn);
    });

    // Hide the big flag area in this mode to avoid giving it away
    flagHolder.classList.add("hidden");
  }
}

function lockMCQButtons() {
  [...optionsEl.querySelectorAll("button")].forEach(b => (b.disabled = true));
}

function checkAnswer({ pickedName, pickedCode, typedText } = {}) {
  const q = questions[qPointer];
  const correct = q.correct;

  let isCorrect = false;
  let pickedLabel = "";

  if (questionType === "flagToName") {
    const expected = normalize(correct.name);
    const got = normalize(pickedName || typedText || "");
    isCorrect = got === expected;
    pickedLabel = pickedName || typedText || "";
  } else {
    isCorrect = (pickedCode || "") === correct.code;
    pickedLabel = pickedCode || "";
  }

  // Update UI feedback and scoring
  if (answerMode === "mcq") lockMCQButtons();

  if (isCorrect) {
    score += 1;
    setFeedback("✅ Correct!", "good");
  } else {
    setFeedback(`❌ Oops! Correct answer: ${correct.name}`, "bad");
  }

  // Save review record
  lastResults.push({
    region: correct.region,
    subregion: correct.subregion,
    correctName: correct.name,
    correctCode: correct.code,
    questionType,
    answerMode,
    picked: pickedLabel,
    wasCorrect: isCorrect
  });

  scoreEl.textContent = String(score);
  nextBtn.classList.remove("hidden");
}

function nextQuestion() {
  qPointer += 1;
  if (qPointer >= questions.length) {
    endGame();
    return;
  }
  renderQuestion();
}

function endGame() {
  showScreen("result");
  finalScoreEl.textContent = String(score);
  finalTotalEl.textContent = String(questions.length);

  // Review list
  reviewEl.innerHTML = "";
  lastResults.forEach((r, idx) => {
    const div = document.createElement("div");
    div.className = "review-item";
    div.innerHTML = `
      <div><strong>Q${idx + 1}</strong> — ${r.wasCorrect ? "✅" : "❌"} ${r.correctName}</div>
      <div style="margin-top:6px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <img src="${flagUrl(r.correctCode)}" alt="Flag of ${r.correctName}" style="width:72px;border-radius:8px;border:1px solid rgba(255,255,255,.08);" />
        <div>Level: <strong>${r.region} • ${r.subregion}</strong></div>
      </div>
    `;
    reviewEl.appendChild(div);
  });
}

function quitToMenu() {
  showScreen("menu");
}

// ---------- Events ----------
startBtn.addEventListener("click", startGame);
quitBtn.addEventListener("click", quitToMenu);
nextBtn.addEventListener("click", nextQuestion);

answerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const typed = answerInput.value;
  checkAnswer({ typedText: typed });
});

playAgainBtn.addEventListener("click", () => {
  showScreen("game");
  // restart with same settings & level
  startGame();
});

backToMenuBtn.addEventListener("click", quitToMenu);

// ---------- Init ----------
(async function init() {
  try {
    await loadDB();
    buildLevelSelectors();
    showScreen("menu");
  } catch (err) {
    console.error(err);
    alert("Error loading the app. Make sure you're serving it via GitHub Pages (not opening index.html directly).");
  }
})();
