let playerId
let isHost = false

const params = new URLSearchParams(location.search)
const roomId = params.get("room") || "default"

const roomRef = db.collection("rooms").doc(roomId)
const playersRef = roomRef.collection("players")

async function join() {

  const name = document.getElementById("name").value
  if (!name) return alert("名前を入力してください")

  playerId = Math.random().toString(36).slice(2)

  const snapshot = await playersRef.get()

  if (snapshot.empty) {
    isHost = true
    // ホストIDをFirestoreに保存
    await roomRef.set({ hostId: playerId }, { merge: true })
  }

  await playersRef.doc(playerId).set({
    name: name,
    hint: "",
    card: 0
  })

  // ブラウザを閉じたら自動でプレイヤー削除
  playersRef.doc(playerId).onDisconnect().delete()

  document.getElementById("login").style.display = "none"
  document.getElementById("lobby").style.display = "block"

  listenPlayers()
  listenRoom()

}

function listenPlayers() {

  playersRef.onSnapshot(snapshot => {

    const playersDiv = document.getElementById("players")
    const hintList = document.getElementById("hintList")
    const order = document.getElementById("order")

    playersDiv.innerHTML = ""
    hintList.innerHTML = ""
    order.innerHTML = ""

    snapshot.forEach(doc => {

      const p = doc.data()

      const d = document.createElement("div")
      d.innerText = p.name
      playersDiv.appendChild(d)

      const li = document.createElement("li")
      li.innerText = p.name + " : " + p.hint
      hintList.appendChild(li)

      const li2 = document.createElement("li")
      li2.innerText = p.name
      li2.dataset.card = p.card
      order.appendChild(li2)

      if (doc.id === playerId) {
        document.getElementById("card").innerText = p.card
      }

    })

    new Sortable(order, { animation: 150 })

  })

}

function listenRoom() {

  roomRef.onSnapshot(async doc => {

    const data = doc.data()
    if (!data) return

    if (data.theme) {
      document.getElementById("theme").innerText = data.theme
    }

    if (data.state === "PLAY") {
      document.getElementById("lobby").style.display = "none"
      document.getElementById("game").style.display = "block"
    }

    // ホスト引き継ぎチェック
    if (data.hostId) {
      const hostDoc = await playersRef.doc(data.hostId).get()

      if (!hostDoc.exists) {
        // ホストがいなくなった → 残っているプレイヤーの先頭が引き継ぐ
        const remaining = await playersRef.get()
        if (!remaining.empty) {
          const newHostId = remaining.docs[0].id
          if (newHostId === playerId) {
            isHost = true
            await roomRef.update({ hostId: playerId })
            alert("ホストが抜けたため、あなたがホストになりました")
          }
        }
      } else {
        // 自分がホストかどうかを同期
        isHost = (data.hostId === playerId)
      }
    }

  })

}

async function startGame() {

  if (!isHost) {
    alert("ホストのみ開始できます")
    return
  }

  const snapshot = await playersRef.get()

  const ids = []
  snapshot.forEach(doc => ids.push(doc.id))

  const numbers = [...Array(100)].map((_, i) => i + 1)

  numbers.sort(() => Math.random() - 0.5)

  ids.forEach((id, i) => {
    playersRef.doc(id).update({
      card: numbers[i]
    })
  })

  const res = await fetch("ito_themes.json")
  const data = await res.json()

  const theme = data.themes[Math.floor(Math.random() * data.themes.length)]

  await roomRef.set({
    state: "PLAY",
    theme: theme
  }, { merge: true })

}

async function updateHint() {

  const text = document.getElementById("hint").value

  await playersRef.doc(playerId).update({
    hint: text
  })

}

function check() {

  const items = document.querySelectorAll("#order li")

  let prev = 0
  let success = true

  items.forEach(el => {

    const n = parseInt(el.dataset.card)

    if (n < prev) success = false

    prev = n

  })

  const result = document.getElementById("result")

  if (success) {
    result.innerText = "成功！"
  } else {
    result.innerText = "失敗！"
  }

}
