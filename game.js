// game.js - ゲームロジック

/**
 * 1〜100をシャッフルして人数分のカードを返す
 */
export function dealCards(playerIds) {
  const deck = Array.from({ length: 100 }, (_, i) => i + 1);
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cards = {};
  playerIds.forEach((id, idx) => {
    cards[id] = deck[idx];
  });
  return cards;
}

/**
 * テーマJSONからランダムにテーマを選ぶ
 */
export async function pickTheme() {
  try {
    const res = await fetch("./ito_themes.json");
    const themes = await res.json();
    return themes[Math.floor(Math.random() * themes.length)];
  } catch {
    return { theme: "強い動物", scale: "1:弱い → 100:強い" };
  }
}

/**
 * orderの順番でカードが昇順かチェック
 */
export function isSorted(order, cards) {
  for (let i = 1; i < order.length; i++) {
    if (cards[order[i]] < cards[order[i - 1]]) return false;
  }
  return true;
}

/**
 * ランダムなルームIDを生成（6文字英数字）
 */
export function generateRoomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * プレイヤーIDを生成
 */
export function generatePlayerId() {
  return "p_" + Math.random().toString(36).slice(2, 10);
}
