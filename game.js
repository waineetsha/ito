let playerId
let isHost = false

const params = new URLSearchParams(location.search)
const roomId = params.get("room") || "default"

document.getElementById("roomIdDisplay").textContent = roomId

const roomRef = db.collection("rooms").doc(roomId)
const playersRef = roomRef.collection("players")

// ========== 参加 ==========

async function join() {
  const name = document.getElementById("name").value.trim()
  if (!name) return alert("名前を入力してください")

  playerId = Math.random().toString(36).slice(2)

  const snapshot = await playersRef.get()

  if (snapshot.empty) {
    isHost = true
    await roomRef.set({ hostId: playerId, state: "LOBBY" }, { merge: true })
  }

  await playersRef.doc(playerId).set({
    name: name,
    hint: "",
    card: 0
  })

  showScreen("lobby")
  updateHostUI()
  listenPlayers()
  listenRoom()
}

// ========== 画面切り替え ==========

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"))
  document.getElementById("screen-" + name).classList.add("active")
}

function updateHostUI() {
  const startBtn = document.getElementById("startBtn")
  const hostNote = document.getElementById("hostNote")
  const checkBtn = document.getElementById("checkBtn")
  if (isHost) {
    startBtn.style.display = "block"
    hostNote.style.display = "none"
    if (checkBtn) checkBtn.style.display = "block"
  } else {
    startBtn.style.display = "none"
    hostNote.style.display = "block"
    if (checkBtn) checkBtn.style.display = "none"
  }
}

// ========== プレイヤー監視 ==========

function listenPlayers() {
  playersRef.onSnapshot(snapshot => {
    // ロビーのプレイヤー一覧
    const playersDiv = document.getElementById("players")
    playersDiv.innerHTML = ""
    snapshot.forEach(doc => {
      const p = doc.data()
      const d = document.createElement("div")
      d.className = "player-item"
      d.textContent = p.name
      playersDiv.appendChild(d)
    })

    // ゲーム中のヒント一覧
    const hintList = document.getElementById("hintList")
    hintList.innerHTML = ""
    snapshot.forEach(doc => {
      const p = doc.data()
      const li = document.createElement("li")
      li.innerHTML = `
        <span class="hint-name">${p.name}</span>
        <span class="hint-value">${p.hint || "—"}</span>
      `
      hintList.appendChild(li)
    })

    // 並び替えリスト（差分更新でSortableを壊さない）
    const order = document.getElementById("order")
    const existingIds = [...order.children].map(el => el.dataset.id)
    const newIds = snapshot.docs.map(doc => doc.id)

    snapshot.forEach(doc => {
      const p = doc.data()
      if (!existingIds.includes(doc.id)) {
        const li = document.createElement("li")
        li.dataset.id = doc.id
        li.dataset.card = p.card
        li.innerHTML = `<span class="drag-handle">⠿</span>${p.name}`
        order.appendChild(li)
      } else {
        const el = order.querySelector(`[data-id="${doc.id}"]`)
        if (el) el.dataset.card = p.card
      }
    })

    existingIds.forEach(id => {
      if (!newIds.includes(id)) {
        const el = order.querySelector(`[data-id="${id}"]`)
        if (el) el.remove()
      }
    })

    // 自分のカード表示
    snapshot.forEach(doc => {
      if (doc.id === playerId) {
        document.getElementById("card").textContent = doc.data().card || "—"
      }
    })
  })
}

// ========== ルーム監視 ==========

function listenRoom() {
  roomRef.onSnapshot(async doc => {
    const data = doc.data()
    if (!data) return

    if (data.theme) {
      document.getElementById("theme").textContent = data.theme
    }

    if (data.state === "PLAY") {
      showScreen("game")
      initSortable()
      document.getElementById("result-overlay").classList.add("hidden")
    }

    if (data.state === "LOBBY") {
      showScreen("lobby")
    }

    // 結果をFirestoreから全員に反映
    if (data.state === "RESULT" && data.result) {
      showResult(data.result)
    }

    // ホスト引き継ぎ
    if (data.hostId && !isHost) {
      const hostDoc = await playersRef.doc(data.hostId).get()
      if (!hostDoc.exists) {
        const remaining = await playersRef.get()
        if (!remaining.empty) {
          const newHostId = remaining.docs[0].id
          if (newHostId === playerId) {
            isHost = true
            await roomRef.update({ hostId: playerId })
            updateHostUI()
            alert("ホストが抜けたため、あなたがホストになりました")
          }
        }
      } else if (data.hostId === playerId) {
        isHost = true
        updateHostUI()
      }
    }
  })
}

// ========== Sortable初期化 ==========

let sortableInstance = null

function initSortable() {
  const order = document.getElementById("order")
  if (sortableInstance) sortableInstance.destroy()
  sortableInstance = new Sortable(order, { animation: 150, handle: ".drag-handle" })
}

// ========== ゲーム開始 ==========

async function startGame() {
  if (!isHost) return alert("ホストのみ開始できます")

  const snapshot = await playersRef.get()
  const ids = []
  snapshot.forEach(doc => ids.push(doc.id))

  const numbers = [...Array(100)].map((_, i) => i + 1)
  numbers.sort(() => Math.random() - 0.5)

  const batch = db.batch()
  ids.forEach((id, i) => {
    batch.update(playersRef.doc(id), { card: numbers[i], hint: "" })
  })
  await batch.commit()

  const res = await fetch("ito_themes.json")
  const data = await res.json()
  const theme = data.themes[Math.floor(Math.random() * data.themes.length)]

  await roomRef.set({ state: "PLAY", theme: theme, result: null }, { merge: true })
}

// ========== ヒント更新 ==========

async function updateHint() {
  const text = document.getElementById("hint").value.trim()
  if (!text) return
  await playersRef.doc(playerId).update({ hint: text })
}

// ========== 結果確認（ホストのみ送信、全員に反映） ==========

async function check() {
  const items = document.querySelectorAll("#order li")
  let prev = 0
  let success = true

  const order = []
  items.forEach(el => {
    const n = parseInt(el.dataset.card)
    const name = el.textContent.replace("⠿", "").trim()
    if (n < prev) success = false
    prev = n
    order.push({ name, card: n })
  })

  const result = { success, order }

  // Firestoreに保存 → 全員のlistenRoomが反応する
  await roomRef.update({ state: "RESULT", result })
}

// ========== 結果表示（全員共通） ==========

function showResult(result) {
  const { success, order } = result

  document.getElementById("result-emoji").textContent = success ? "🎉" : "💥"
  const text = document.getElementById("result-text")
  text.textContent = success ? "成功！" : "失敗…"
  text.className = "result-text " + (success ? "success" : "fail")

  document.getElementById("result-cards").innerHTML = order.map(o =>
    `<div class="result-card-item"><span class="result-card-num">${o.card}</span>${o.name}</div>`
  ).join("")

  document.getElementById("result-overlay").classList.remove("hidden")

  // 次のラウンドボタンはホストのみ表示
  document.getElementById("nextRoundBtn").style.display = isHost ? "block" : "none"
}

function closeResult() {
  document.getElementById("result-overlay").classList.add("hidden")
}

// ========== 次のラウンド ==========

async function nextRound() {
  closeResult()
  document.getElementById("hint").value = ""
  if (isHost) await startGame()
}
