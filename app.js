// app.js - メインアプリケーションロジック
import { db, ref, set, get, update, onValue, push, remove } from "./firebase.js";
import { dealCards, pickTheme, isSorted, generateRoomId, generatePlayerId } from "./game.js";

// ===== STATE =====
let myId = null;
let myName = null;
let roomId = null;
let isHost = false;
let isSpectator = false;
let unsubscribe = null;
let currentData = null;

// ドラッグ用
let dragSrcId = null;

// ===== UTIL =====
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  $(id).classList.add("active");
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

function showLoading(msg = "読み込み中...") {
  $("loading").style.display = "flex";
  $("loading-msg").textContent = msg;
}
function hideLoading() { $("loading").style.display = "none"; }

function getRoomUrl(id) {
  return `${location.origin}${location.pathname}?room=${id}`;
}

// ===== INIT =====
async function init() {
  showLoading();
  const params = new URLSearchParams(location.search);
  roomId = params.get("room");

  if (roomId) {
    // URL付きアクセス: 参加フロー
    hideLoading();
    showNameScreen();
  } else {
    // トップ画面
    hideLoading();
    showScreen("screen-top");
  }
}

// ===== TOP SCREEN =====
$("btn-create-room").addEventListener("click", async () => {
  showLoading("ルームを作成中...");
  roomId = generateRoomId();
  const newUrl = getRoomUrl(roomId);
  history.pushState({}, "", `?room=${roomId}`);
  hideLoading();
  showNameScreen(true);
});

$("btn-join-manual").addEventListener("click", () => {
  const input = prompt("ルームIDを入力してください:");
  if (input && input.trim()) {
    roomId = input.trim();
    history.pushState({}, "", `?room=${roomId}`);
    showNameScreen();
  }
});

// ===== NAME SCREEN =====
function showNameScreen(isCreating = false) {
  $("name-join-info").textContent = isCreating
    ? "新しいルームを作成します"
    : `ルーム「${roomId}」に参加します`;
  showScreen("screen-name");
}

$("btn-join").addEventListener("click", () => joinRoom());
$("input-name").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });

async function joinRoom() {
  const name = $("input-name").value.trim();
  if (!name) { showError("name-error", "名前を入力してください"); return; }

  showLoading("参加中...");
  myId = generatePlayerId();
  myName = name;

  try {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snap = await get(roomRef);
    const data = snap.val();

    if (!data) {
      // 新規ルーム作成
      isHost = true;
      isSpectator = false;
      await set(roomRef, {
        phase: "lobby",
        theme: "",
        themeScale: "",
        hostId: myId,
        players: { [myId]: { name: myName } },
        spectators: {},
        cards: {},
        hints: {},
        order: [myId]
      });
    } else {
      // 既存ルームへ参加
      const playerCount = Object.keys(data.players || {}).length;
      if (playerCount >= 12) {
        // 観戦モード
        isSpectator = true;
        isHost = false;
        await update(ref(db, `rooms/${roomId}/spectators`), { [myId]: { name: myName } });
      } else {
        isSpectator = false;
        isHost = (data.hostId === myId);
        const updates = {};
        updates[`rooms/${roomId}/players/${myId}`] = { name: myName };
        // orderに追加
        const order = data.order || [];
        if (!order.includes(myId)) order.push(myId);
        updates[`rooms/${roomId}/order`] = order;
        await update(ref(db), updates);
      }
    }

    hideLoading();
    startListening();
  } catch (err) {
    hideLoading();
    showError("name-error", "接続に失敗しました: " + err.message);
  }
}

// ===== REAL-TIME LISTENER =====
function startListening() {
  if (unsubscribe) unsubscribe();
  const roomRef = ref(db, `rooms/${roomId}`);
  unsubscribe = onValue(roomRef, (snap) => {
    const data = snap.val();
    if (!data) return;
    currentData = data;

    // ホスト判定更新
    isHost = (data.hostId === myId);

    if (data.phase === "lobby") renderLobby(data);
    else if (data.phase === "play") renderPlay(data);
    else if (data.phase === "result") renderResult(data);
  });
}

// ===== LOBBY =====
function renderLobby(data) {
  showScreen("screen-lobby");

  // URL表示
  $("room-url-display").textContent = getRoomUrl(roomId);

  // プレイヤー一覧
  const players = data.players || {};
  $("lobby-players").innerHTML = Object.entries(players).map(([pid, p]) => {
    const isMe = pid === myId;
    const isH = pid === data.hostId;
    return `<div class="player-chip${isH ? " host" : ""}${isMe ? " me" : ""}">${p.name}</div>`;
  }).join("");

  // 観戦者一覧
  const specs = data.spectators || {};
  const specCount = Object.keys(specs).length;
  $("lobby-spectators").innerHTML = specCount
    ? Object.values(specs).map(s => `<div class="spectator-chip">👁 ${s.name}</div>`).join("")
    : "";
  $("lobby-spectator-section").style.display = specCount > 0 ? "block" : "none";

  // 人数表示
  const pCount = Object.keys(players).length;
  $("lobby-status").textContent = `${pCount}/12 人参加中`;

  // ゲーム開始ボタン（ホストのみ）
  $("lobby-host-area").style.display = isHost ? "block" : "none";

  // 観戦中バッジ
  $("lobby-spectator-badge").style.display = isSpectator ? "flex" : "none";
}

$("btn-start-game").addEventListener("click", async () => {
  if (!isHost) return;
  const players = Object.keys(currentData.players || {});
  if (players.length < 2) { showToast("2人以上必要です"); return; }
  await startNewRound();
});

async function startNewRound() {
  const players = Object.keys(currentData.players || {});
  const cards = dealCards(players);
  const t = await pickTheme();
  const order = currentData.order && currentData.order.length === players.length
    ? currentData.order
    : players;

  await update(ref(db, `rooms/${roomId}`), {
    phase: "play",
    theme: t.theme,
    themeScale: t.scale,
    cards,
    hints: {},
    order
  });
}

// ===== COPY URL =====
$("btn-copy-url").addEventListener("click", () => {
  navigator.clipboard.writeText(getRoomUrl(roomId)).then(() => showToast("URLをコピーしました！"));
});

// ===== PLAY =====
function renderPlay(data) {
  showScreen("screen-play");

  const players = data.players || {};
  const hints = data.hints || {};
  const order = data.order || Object.keys(players);

  // 観戦バッジ
  $("play-spectator-badge").style.display = isSpectator ? "flex" : "none";

  // テーマ
  $("play-theme").textContent = data.theme || "テーマなし";
  $("play-theme-scale").textContent = data.themeScale || "";

  // 自分のカード（プレイヤーのみ）
  if (!isSpectator) {
    $("my-card-area").style.display = "block";
    $("my-card-num").textContent = data.cards?.[myId] ?? "?";
  } else {
    $("my-card-area").style.display = "none";
  }

  // ヒント入力（プレイヤーのみ）
  $("hint-input-area").style.display = isSpectator ? "none" : "flex";
  $("hint-input").value = hints[myId] || "";

  // ヒント一覧
  $("hints-list").innerHTML = order.map(pid => {
    const p = players[pid];
    if (!p) return "";
    const hint = hints[pid];
    return `<div class="hint-item">
      <span class="hint-name">${p.name}</span>
      ${hint
        ? `<span class="hint-text">${escapeHtml(hint)}</span>`
        : `<span class="hint-empty">未入力</span>`
      }
    </div>`;
  }).join("");

  // 並び替えボード
  renderSortBoard(order, players, hints);

  // ホスト操作
  $("host-controls-play").style.display = isHost ? "block" : "none";
}

function renderSortBoard(order, players, hints) {
  const board = $("sort-board");
  board.innerHTML = "";

  if (!order.length) {
    board.innerHTML = `<div class="drag-hint">プレイヤーを待っています...</div>`;
    return;
  }

  order.forEach((pid, idx) => {
    const p = players[pid];
    if (!p) return;
    const hint = hints?.[pid];
    const item = document.createElement("div");
    item.className = "sort-item";
    item.dataset.pid = pid;
    item.draggable = !isSpectator;
    item.innerHTML = `
      <span class="sort-rank">${idx + 1}</span>
      <span class="sort-name">${escapeHtml(p.name)}</span>
      ${hint
        ? `<span class="sort-hint">${escapeHtml(hint)}</span>`
        : `<span class="sort-hint-empty">ヒントなし</span>`
      }
    `;

    if (!isSpectator) {
      item.addEventListener("dragstart", onDragStart);
      item.addEventListener("dragover", onDragOver);
      item.addEventListener("dragleave", onDragLeave);
      item.addEventListener("drop", onDrop);
      item.addEventListener("dragend", onDragEnd);
    }

    board.appendChild(item);
  });
}

// ===== DRAG & DROP =====
function onDragStart(e) {
  dragSrcId = e.currentTarget.dataset.pid;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over-item");
}
function onDragLeave(e) {
  e.currentTarget.classList.remove("drag-over-item");
}
function onDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.pid;
  e.currentTarget.classList.remove("drag-over-item");
  if (dragSrcId === targetId) return;

  const order = [...(currentData.order || [])];
  const srcIdx = order.indexOf(dragSrcId);
  const tgtIdx = order.indexOf(targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  order.splice(srcIdx, 1);
  order.splice(tgtIdx, 0, dragSrcId);

  update(ref(db, `rooms/${roomId}`), { order });
}
function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".drag-over-item").forEach(el => el.classList.remove("drag-over-item"));
}

// ===== HINT SUBMIT =====
$("btn-submit-hint").addEventListener("click", submitHint);
$("hint-input").addEventListener("keydown", (e) => { if (e.key === "Enter") submitHint(); });

function submitHint() {
  const hint = $("hint-input").value.trim();
  update(ref(db, `rooms/${roomId}/hints`), { [myId]: hint || null });
  showToast("ヒントを更新しました");
}

// ===== HOST: テーマチェンジ =====
$("btn-theme-change").addEventListener("click", async () => {
  if (!isHost) return;
  showLoading("テーマを変更中...");
  const players = Object.keys(currentData.players || {});
  const cards = dealCards(players);
  const t = await pickTheme();
  await update(ref(db, `rooms/${roomId}`), {
    theme: t.theme,
    themeScale: t.scale,
    cards,
    hints: {},
    order: currentData.order || players
  });
  hideLoading();
  showToast("テーマを変更しました");
});

// ===== HOST: 順番確定 =====
$("btn-confirm-order").addEventListener("click", async () => {
  if (!isHost) return;
  const data = currentData;
  const order = data.order || [];
  const cards = data.cards || {};

  if (order.length < 2) { showToast("2人以上必要です"); return; }

  const success = isSorted(order, cards);
  await update(ref(db, `rooms/${roomId}`), { phase: "result", success });
});

// ===== RESULT =====
function renderResult(data) {
  showScreen("screen-result");

  const success = data.success;
  $("result-label").textContent = success ? "成功！" : "失敗...";
  $("result-label").className = "result-label " + (success ? "success" : "fail");

  const players = data.players || {};
  const hints = data.hints || {};
  const cards = data.cards || {};
  const order = data.order || [];

  // 実際の順番で並べてチェック
  let prevCard = -1;
  $("result-order").innerHTML = order.map((pid, idx) => {
    const p = players[pid];
    if (!p) return "";
    const card = cards[pid];
    const hint = hints[pid];
    const wrong = card < prevCard;
    prevCard = card;
    return `<div class="result-row${wrong ? " wrong" : ""}">
      <span class="result-rank">${idx + 1}</span>
      <span class="result-name">${escapeHtml(p.name)}</span>
      <span class="result-hint">${hint ? escapeHtml(hint) : "—"}</span>
      <span class="result-card-num">${card}</span>
    </div>`;
  }).join("");

  $("result-host-controls").style.display = isHost ? "block" : "none";
}

$("btn-again").addEventListener("click", async () => {
  if (!isHost) return;
  showLoading("次のラウンドへ...");
  await startNewRound();
  hideLoading();
});

// ===== HELPERS =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 3000);
}

// ===== START =====
init();
