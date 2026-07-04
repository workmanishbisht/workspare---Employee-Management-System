import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdzjwbhF14E3R5yzAmq42TeQ4Jof0XkJU",
  authDomain: "workspare-c2077.firebaseapp.com",
  projectId: "workspare-c2077",
  storageBucket: "workspare-c2077.firebasestorage.app",
  messagingSenderId: "561634206754",
  appId: "1:561634206754:web:c70ddbdd3a4bff2ce0967b",
  measurementId: "G-PV1S94RK8Z",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
export const microsoftProvider = new OAuthProvider("microsoft.com");

googleProvider.setCustomParameters({
  prompt: "select_account",
});

microsoftProvider.setCustomParameters({
  prompt: "select_account",
});

export default app;
