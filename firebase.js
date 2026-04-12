// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAO5TuFOawHyQAA5hkKAPO5s8JdUZW1SfI",
  authDomain: "who-ate--the-cheese.firebaseapp.com",
  projectId: "who-ate--the-cheese",
  storageBucket: "who-ate--the-cheese.firebasestorage.app",
  messagingSenderId: "135374886454",
  appId: "1:135374886454:web:cac68629a9a34882872a97",
  measurementId: "G-8329C39BYR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);