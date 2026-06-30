import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgXQe9wpVC5hrL053DNOX06x2C9oYIcEo",
  authDomain: "workmesh-ad848.firebaseapp.com",
  databaseURL: "https://workmesh-ad848-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "workmesh-ad848",
  storageBucket: "workmesh-ad848.firebasestorage.app",
  messagingSenderId: "93966939997",
  appId: "1:93966939997:web:edc9a2efd9249f9d8f5ab4",
  measurementId: "G-67M10CWG9W"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);

export { app, db, rtdb, auth };
