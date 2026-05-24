/*
   Block Inventory Management System - Firebase Configuration (Compat Mode)
   Designed without ES6 modules (no import/export) to prevent CORS policy blocks
   when opening the index.html locally via the file:/// protocol.
*/

// paste your real Firebase keys here to connect to your live google cloud account
const firebaseConfig = {
  apiKey: "AIzaSyDVoF2I-XCpgi8gV4zSUu-Ni0r1HrN45X4",
  authDomain: "block-factory-inventor.firebaseapp.com",
  projectId: "block-factory-inventor",
  storageBucket: "block-factory-inventor.firebasestorage.app",
  messagingSenderId: "1043628730812",
  appId: "1:1043628730812:web:6b196d02423b30b628e3b9"
};

// Check if the user has configured real keys
const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey && 
         firebaseConfig.apiKey !== "YOUR_API_KEY_PLACEHOLDER" && 
         firebaseConfig.projectId !== "YOUR_PROJECT_ID";
};

let db = null;
let isDemoMode = true;

if (isFirebaseConfigured()) {
  try {
    // Initialized using Firebase Compat SDK loaded via global scripts
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    isDemoMode = false;
    console.log("🔥 Connected to Google Firebase cloud database successfully!");
  } catch (error) {
    console.warn("⚠️ Firebase connection failed, falling back to LocalStorage Sandbox mode:", error.message);
    isDemoMode = true;
  }
} else {
  console.log("⚡ Firebase is not configured yet. Running in offline Sandbox/Demo Mode using LocalStorage.");
  isDemoMode = true;
}

// Expose variables globally so other scripts can access them without import
window.isDemoMode = isDemoMode;
window.db = db;
window.firebaseConfig = firebaseConfig;
