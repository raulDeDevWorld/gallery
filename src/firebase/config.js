import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyDefHAji1vnmi-o478Q6cY8t-rwnCOEceM",
  authDomain: "rns-fashion-gallery-elite.firebaseapp.com",
  databaseURL: "https://rns-fashion-gallery-elite-default-rtdb.firebaseio.com",
  projectId: "rns-fashion-gallery-elite",
  storageBucket: "rns-fashion-gallery-elite.firebasestorage.app",
  messagingSenderId: "727858161617",
  appId: "1:727858161617:web:f8a26cf1f47b1408dae2f0",
  measurementId: "G-N9EGRD7SS3"
};

const app = initializeApp(firebaseConfig)

export { app }



