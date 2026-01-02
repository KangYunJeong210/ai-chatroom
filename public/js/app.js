// /public/js/app.js
// Vercel 구조 기준: /api/chat (서버리스)로 Gemini 호출
// 기능: 예쁜 단톡 UI + 타이핑 인디케이터 + 다크모드 + 참여자 시트 + "대화 기억(단기/장기) + 로컬 저장"

const $ = (sel) => document.querySelector(sel);

/* =========================
   DOM
========================= */
const chat = $("#chat");
const input = $("#input");
const btnSend = $("#btnSend");
const btnTheme = $("#btnTheme");

const btnMenu = $("#btnMenu");
const sheet = $("#sheet");
const btnCloseSheet = $("#btnCloseSheet");
const sheetBackdrop = $("#sheetBackdrop");
const membersEl = $("#members");

const typingRow = $("#typingRow");
const typingAvatar = $("#typingAvatar");

const roomSub = $("#roomSub");
const moodText = $("#moodText");
const timeText = $("#timeText");

/* =========================
   State / Characters
========================= */
const characters = [
  { id: "elliot", name: "엘리엇", emoji: "🙂", style: "담담하고 직설적, 짧게 말함", desc: "짧고 정확한 편." },
  { id: "mina", name: "미나", emoji: "🧐", style: "관찰자, 가끔 질문으로 정리", desc: "질문으로 흐름을 잡음." },
  { id: "juno", name: "주노", emoji: "😆", style: "리액션+드립, ㅋㅋ 자주 씀", desc: "분위기 메이커." },
];

const STORAGE_KEY = "ai_chatroom_memory_v1";
const CHATLOG_KEY = "ai_chatroom_chatlog_v1";

const state = {
  theme: localStorage.getItem("theme") || "light",
  turn: 0,
  timeOfDay: "오전",
  mood: "평온",
  readCount: 2,

  // 단기 기억(최근 대화 N줄)
  shortLines: [],
  shortLimit: 16,

  // 장기 기억(요약된 사실/취향/관계)
  longLines: [],
  longLimit: 10,

  // 로컬에 채팅 로그도 저장(새로고침해도 계속)
  chatLog: [], // [{who,text,at,read,type}]
  chatLogLimit: 250,
};

/* =========================
   Theme
========================= */
function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("theme", theme);

  const icon = btnTheme.querySelector(".pill-icon");
  const text = btnTheme.querySelector(".pill-text");
  if (theme === "dark") {
    icon.textContent = "☀️";
    text.textContent = "Light";
  } else {
    icon.textContent = "🌙";
    text.textContent = "Dark";
  }
}
setTheme(state.theme);

/* =========================
   Utils
========================= */
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function typeDelay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function autoGrowTextarea() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}

function avatarHTML(emoji) {
  return `<div class="emoji" aria-hidden="true">${escapeHtml(emoji)}</div>`;
}

/* =========================
   Side sheet
========================= */
function openSheet() {
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
}
function closeSheet() {
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
}

function renderMembers() {
  membersEl.innerHTML = "";
  for (const c of characters) {
    const el = document.createElement("div");
    el.className = "member";
    el.innerHTML = `
      <div class="avatar">${avatarHTML(c.emoji)}</div>
      <div class="meta">
        <div class="name">
          <span>${escapeHtml(c.name)}</span>
          <span class="badge">${escapeHtml(c.style.split(",")[0])}</span>
        </div>
        <div class="desc">${escapeHtml(c.desc)}</div>
      </div>
    `;
    membersEl.appendChild(el);
  }
}
renderMembers();

/* =========================
   Room meta
========================= */
function setRoomSub() {
  roomSub.textContent = `${characters.length}명 대화 중`;
  moodText.textContent = state.mood;
  timeText.textContent = state.timeOfDay;
}
setRoomSub();

function advanceTimeOfDay() {
  const list = ["오전", "점심", "오후", "저녁", "밤"];
  const idx = list.indexOf(state.timeOfDay);
  state.timeOfDay = list[(idx + 1) % list.length];
}

function nudgeMood(userText) {
  if (/짜증|화나|멘붕|불안|우울|빡치|불편/i.test(userText)) state.mood = "살짝 예민";
  else if (/좋아|행복|고마워|신나|최고|설렘/i.test(userText)) state.mood = "좋음";
  else state.mood = "평온";
}

/* =========================
   Memory (short/long) + persist
========================= */
function clampArray(arr, limit) {
  if (arr.length > limit) arr.splice(0, arr.length - limit);
}

function addShort(line) {
  state.shortLines.push(line);
  clampArray(state.shortLines, state.shortLimit);
  persistMemory();
}

function setLong(lines) {
  state.longLines = Array.isArray(lines) ? lines.slice(0, state.longLimit) : [];
  persistMemory();
}

function buildMemoryText() {
  const longPart = state.longLines.length ? state.longLines.join("\n") : "없음";
  const shortPart = state.shortLines.length ? state.shortLines.join("\n") : "없음";
  return `[장기 기억]\n${longPart}\n\n[최근 대화]\n${shortPart}`.trim();
}

function persistMemory() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        turn: state.turn,
        timeOfDay: state.timeOfDay,
        mood: state.mood,
        readCount: state.readCount,
        shortLines: state.shortLines,
        longLines: state.longLines,
      })
    );
  } catch {}
}

function loadMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.turn = Number(parsed.turn || 0);
    state.timeOfDay = String(parsed.timeOfDay || "오전");
    state.mood = String(parsed.mood || "평온");
    state.readCount = Number(parsed.readCount || 2);
    state.shortLines = Array.isArray(parsed.shortLines) ? parsed.shortLines : [];
    state.longLines = Array.isArray(parsed.longLines) ? parsed.longLines : [];
    clampArray(state.shortLines, state.shortLimit);
    clampArray(state.longLines, state.longLimit);
  } catch {}
}

/* =========================
   Chat log persist (optional but nice)
========================= */
function persistChatLog() {
  try {
    localStorage.setItem(CHATLOG_KEY, JSON.stringify(state.chatLog));
  } catch {}
}

function loadChatLog() {
  try {
    const raw = localStorage.getItem(CHATLOG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.chatLog = Array.isArray(parsed) ? parsed : [];
    clampArray(state.chatLog, state.chatLogLimit);
  } catch {}
}

function appendChatLog(item) {
  state.chatLog.push(item);
  clampArray(state.chatLog, state.chatLogLimit);
  persistChatLog();
}

/* =========================
   Message rendering
========================= */
function pushSystem(text, { store = true } = {}) {
  const row = document.createElement("div");
  row.className = "row system";
  row.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chat.appendChild(row);
  scrollToBottom();

  if (store) appendChatLog({ type: "system", who: "system", text, at: nowTime(), read: null });
}

function pushMessage({ who = "me", text = "", at = nowTime(), read = null, store = true } = {}) {
  const isMe = who === "me";
  const row = document.createElement("div");
  row.className = `row ${isMe ? "me" : ""}`;

  let name = "나";
  let emoji = "🙂";
  if (!isMe) {
    const c = characters.find((x) => x.id === who);
    name = c?.name ?? who ?? "???";
    emoji = c?.emoji ?? "🙂";
  }

  const avatar = isMe ? "" : `<div class="avatar">${avatarHTML(emoji)}</div>`;
  const nameLine = isMe ? "" : `<p class="name">${escapeHtml(name)}</p>`;

  const metaBits = [];
  metaBits.push(`<span>${escapeHtml(at)}</span>`);
  if (read !== null) metaBits.push(`<span class="read">읽음 ${escapeHtml(String(read))}</span>`);

  row.innerHTML = `
    ${avatar}
    <div class="bubble">
      ${nameLine}
      <p class="text">${escapeHtml(text)}</p>
      <div class="meta-line">${metaBits.join("")}</div>
    </div>
  `;

  chat.appendChild(row);
  scrollToBottom();

  if (store) appendChatLog({ type: "msg", who, text, at, read });
}

/* =========================
   Typing indicator
========================= */
async function showTyping(who, ms = null) {
  const c = characters.find((x) => x.id === who);
  typingAvatar.innerHTML = avatarHTML(c?.emoji ?? "🙂");
  typingRow.hidden = false;
  scrollToBottom();

  const dur = ms ?? (520 + Math.random() * 520);
  await typeDelay(dur);

  typingRow.hidden = true;
}

/* =========================
   Gemini API call (/api/chat)
========================= */
async function fetchAIReplies(userText) {
  const payload = {
    userText,
    memory: buildMemoryText(),
    characters: characters.map(({ id, name, style }) => ({ id, name, style })),
  };

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");

  // data.data: JSON 배열 문자열
  let arr = [];
  try {
    arr = JSON.parse(data.data);
  } catch {
    const m = String(data.data).match(/\[[\s\S]*\]/);
    if (m) {
      try { arr = JSON.parse(m[0]); } catch { arr = []; }
    }
  }

  return (Array.isArray(arr) ? arr : [])
    .map((x) => ({
      speaker: String(x.speaker || x.who || "").trim(),
      text: String(x.text || "").trim(),
    }))
    .filter((x) => x.speaker && x.text);
}

/* =========================
   Memory summarization (20턴마다)
========================= */
// 요약 전용 지시(유저 메시지 대신 "요약 요청"을 userText로 보내서 /api/chat 재사용)
async function summarizeLongMemory() {
  // 최근 대화가 너무 짧으면 굳이 요약 안 함
  if (state.shortLines.length < 8) return;

  const summaryRequest =
    "지금까지의 [최근 대화]를 기반으로, 앞으로도 유효한 '사실/취향/관계/상태'만 4~7줄로 정리해줘. " +
    "각 줄은 짧게. 추측 금지. 출력은 JSON 배열로, speaker는 'system', text에 줄바꿈으로 요약을 넣어.";

  const payload = {
    userText: summaryRequest,
    memory: `[장기 기억]\n${state.longLines.join("\n") || "없음"}\n\n[최근 대화]\n${state.shortLines.join("\n")}`,
    characters: [
      { id: "system", name: "system", style: "요약만" },
    ],
  };

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) return;

  let arr = [];
  try { arr = JSON.parse(data.data); } catch { arr = []; }
  const text = Array.isArray(arr) && arr[0]?.text ? String(arr[0].text) : "";

  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•]\s*/,"").trim())
    .filter(Boolean)
    .slice(0, state.longLimit);

  if (lines.length) {
    // 장기 기억 업데이트 + 단기 기억 리셋
    setLong(lines);
    state.shortLines = [];
    persistMemory();
  }
}

/* =========================
   Turn loop
========================= */
let sending = false;

async function runTurn(userText) {
  state.turn += 1;
  state.readCount = Math.max(1, Math.min(99, state.readCount + (Math.random() < 0.65 ? 1 : 0)));

  if (state.turn % 6 === 0) advanceTimeOfDay();
  nudgeMood(userText);
  setRoomSub();
  persistMemory();

  const replies = await fetchAIReplies(userText);
  const sliced = replies.slice(0, 3);

  for (const msg of sliced) {
    const who = characters.some((c) => c.id === msg.speaker) ? msg.speaker : characters[0].id;

    await showTyping(who);
    pushMessage({
      who,
      text: msg.text,
      read: Math.random() < 0.6 ? state.readCount : null,
    });

    const whoName = characters.find((c) => c.id === who)?.name ?? who;
    addShort(`${whoName}: ${msg.text}`);
  }

  // 20턴마다 장기 기억 요약(비용 절약 + 지속 기억 느낌)
  if (state.turn % 20 === 0) {
    // 사용자 UX 깨지지 않게 조용히 진행 (실패해도 무시)
    summarizeLongMemory().catch(() => {});
  }
}

/* =========================
   Send
========================= */
async function send() {
  if (sending) return;

  const text = input.value.trim();
  if (!text) return;

  sending = true;
  btnSend.disabled = true;

  input.value = "";
  autoGrowTextarea();

  // 내 메시지
  pushMessage({ who: "me", text, read: null });
  addShort(`나: ${text}`);

  try {
    await runTurn(text);
  } catch (e) {
    pushSystem(`오류: ${e?.message || e}`);
  } finally {
    sending = false;
    btnSend.disabled = false;
    input.focus();
  }
}

/* =========================
   Idle smalltalk (optional)
========================= */
let idleTimer = null;

function resetIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (sending) return resetIdle();
    if (Math.random() < 0.6) return resetIdle();

    const who = characters[Math.floor(Math.random() * characters.length)].id;
    await showTyping(who, 700);

    const text = smallTalk(who);
    pushMessage({ who, text, read: Math.random() < 0.6 ? state.readCount : null });

    const whoName = characters.find((c) => c.id === who)?.name ?? who;
    addShort(`${whoName}: ${text}`);

    resetIdle();
  }, 35000 + Math.random() * 45000);
}

function smallTalk(who) {
  const deck = {
    juno: ["아 갑자기 배고픈데… 뭐 먹을래? 😆", "오늘 왜 이렇게 시간이 빨리 감 ㅋㅋ", "너 지금 뭐 보는 중? 추천해줘!"],
    mina: ["오늘 컨디션 점수로 치면 몇 점이야?", "지금 그 얘기 한 문장으로 요약하면 뭐야?", "요즘 수면 루틴 괜찮아?"],
    elliot: ["물 마셔. 진짜로.", "오늘은 무리하지 말자.", "기분 한 단어로 말해봐."],
  };
  const arr = deck[who] || ["ㅇㅋ. 계속."];
  return arr[Math.floor(Math.random() * arr.length)];
}

/* =========================
   Restore UI from saved logs
========================= */
function renderSavedChatLog() {
  if (!state.chatLog.length) return;

  // 기존 DOM 비우고 다시 그리기
  chat.innerHTML = "";
  for (const item of state.chatLog) {
    if (item.type === "system") {
      pushSystem(item.text, { store: false });
    } else {
      pushMessage({
        who: item.who,
        text: item.text,
        at: item.at || nowTime(),
        read: item.read ?? null,
        store: false,
      });
    }
  }
  scrollToBottom();
}

/* =========================
   Events
========================= */
btnTheme.addEventListener("click", () => {
  setTheme(state.theme === "dark" ? "light" : "dark");
});

btnMenu.addEventListener("click", openSheet);
btnCloseSheet.addEventListener("click", closeSheet);
sheetBackdrop.addEventListener("click", closeSheet);

btnSend.addEventListener("click", send);

input.addEventListener("input", () => {
  autoGrowTextarea();
  resetIdle();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

/* =========================
   Boot
========================= */
loadMemory();
loadChatLog();
setRoomSub();

if (state.chatLog.length) {
  renderSavedChatLog();
} else {
  // 첫 시작 메시지
  pushSystem("단톡방에 입장했어.");
  pushMessage({ who: "juno", text: "오~ 들어왔다! 오늘 뭐하고 있었어? 😆", read: 2 });
  pushMessage({ who: "mina", text: "환영. 근데 너 지금 기분 어떤 편이야?", read: 2 });
  pushMessage({ who: "elliot", text: "필요하면 말해. 난 듣는 건 할게.", read: 2 });

  addShort("시스템: 단톡방에 입장");
  addShort("주노: 오~ 들어왔다! 오늘 뭐하고 있었어?");
  addShort("미나: 환영. 근데 너 지금 기분 어떤 편이야?");
  addShort("엘리엇: 필요하면 말해. 난 듣는 건 할게.");
}

autoGrowTextarea();
input.focus();
resetIdle();
