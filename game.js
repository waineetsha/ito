let playerId
let isHost = false
let currentRoomId = null

const roomsRef = db.collection("rooms")

// ========== ルーム作成 ==========

async function createRoom() {
  const name = document.getElementById("name-create").value.trim()
  if (!name) return alert("名前を入力してください")

  // ランダムな6文字のルームコード生成
  const code = Math.random().toString(36).slice(2, 8).toUpperCase()
  currentRoomId = code

  isHost = true
  playerId = Math.random().toString(36).slice(2)

  const roomRef = db.collection("rooms").doc(code)
  const playersRef = roomRef.collection("players")

  // ルーム作成（クリーンな状態で）
  await roomRef.set({ hostId: playerId, state: "LOBBY", theme: null, result: null })

  // ホスト自身を参加
  await playersRef.doc(playerId).set({ name, hint: "", card: 0 })

  enterLobby(code)
}

// ========== ルーム参加 ==========

async function joinRoom() {
  const code = document.getElementById("room-code").value.trim().toUpperCase()
  const name = document.getElementById("name-join").value.trim()

  if (!code) return alert("ルームコードを入力してください")
  if (!name) return alert("名前を入力してください")

  const roomRef = db.collection("rooms").doc(code)
  const roomSnap = await roomRef.get()

  if (!roomSnap.exists) return alert("ルームが見つかりません。コードを確認してください")

  currentRoomId = code
  playerId = Math.random().toString(36).slice(2)

  const playersRef = roomRef.collection("players")
  await playersRef.doc(playerId).set({ name, hint: "", card: 0 })

  enterLobby(code)
}

// ========== ロビーへ ==========

function enterLobby(code) {
  document.getElementById("roomCodeDisplay").textContent = code
  showScreen("lobby")
  updateHostUI()

  const roomRef = db.collection("rooms").doc(code)
  const playersRef = roomRef.collection("players")

  listenPlayers(roomRef, playersRef)
  listenRoom(roomRef, playersRef)
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

function listenPlayers(roomRef, playersRef) {
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

function listenRoom(roomRef, playersRef) {
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
      updateHostUI()
    }

    if (data.state === "LOBBY") {
      showScreen("lobby")
    }

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

  const roomRef = db.collection("rooms").doc(currentRoomId)
  const playersRef = roomRef.collection("players")

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

  await roomRef.set({ state: "PLAY", theme, result: null }, { merge: true })
}

// ========== ヒント更新 ==========

async function updateHint() {
  const text = document.getElementById("hint").value.trim()
  if (!text) return
  const playersRef = db.collection("rooms").doc(currentRoomId).collection("players")
  await playersRef.doc(playerId).update({ hint: text })
}

// ========== 結果確認 ==========

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

  const roomRef = db.collection("rooms").doc(currentRoomId)
  await roomRef.update({ state: "RESULT", result: { success, order } })
}

// ========== 結果表示 ==========

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
