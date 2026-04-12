// firebase.js
// Firebase設定 - ご自身のFirebaseプロジェクトの設定に変更してください
const firebaseConfig = {
  apiKey: "AIzaSyAO5TuFOawHyQAA5hkKAPO5s8JdUZW1SfI",
  authDomain: "who-ate--the-cheese.firebaseapp.com",
  projectId: "who-ate--the-cheese",
  storageBucket: "who-ate--the-cheese.firebasestorage.app",
  messagingSenderId: "135374886454",
  appId: "1:135374886454:web:cac68629a9a34882872a97",
  measurementId: "G-8329C39BYR"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  push,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, update, onValue, push, remove };
