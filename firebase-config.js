// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAyHYTvmBecF0R6TF9QiY7h2Ab1yhfwBg0",
  authDomain: "bsc-project-tracker-29.firebaseapp.com",
  projectId: "bsc-project-tracker-29",
  storageBucket: "bsc-project-tracker-29.firebasestorage.app",
  messagingSenderId: "1043784511132",
  appId: "1:1043784511132:web:d7bc4779dc5e61a38a8759",
  measurementId: "G-HGBZT3JMRR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
