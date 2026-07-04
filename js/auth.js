/* ==========================================================
   FIREBASE IMPORTS
========================================================== */

import {
  auth,
  db,
  googleProvider,
  microsoftProvider,
} from "../firebase/firebase.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ==========================================================
   PATHS
========================================================== */

const DASHBOARD_PATH = "./pages/dashboard.html";

/* ==========================================================
   DOM ELEMENTS
========================================================== */

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmailInput");
const loginPassword = document.getElementById("loginPasswordInput");
const rememberMe = document.getElementById("rememberMeInput");

const signupForm = document.getElementById("signupForm");
const fullNameInput = document.getElementById("fullNameInput");
const signupEmailInput = document.getElementById("signupEmailInput");
const signupPasswordInput = document.getElementById("signupPasswordInput");
const confirmPasswordInput = document.getElementById("confirmPasswordInput");
const roleSelect = document.getElementById("roleSelect");
const companyInput = document.getElementById("companyInput");

const forgotForm = document.getElementById("forgotForm");
const forgotEmailInput = document.getElementById("forgotEmailInput");
const sentEmailLabel = document.getElementById("sentEmailLabel");

const googleButtons = document.querySelectorAll(".google-login-btn");
const microsoftButtons = document.querySelectorAll(".microsoft-login-btn");

/* ==========================================================
   TOAST NOTIFICATION
========================================================== */

function showToast(type, message) {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="${type === "success" ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"}"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ==========================================================
   FIRESTORE USER HELPER
========================================================== */

async function createUserDocument(user, provider, extraData = {}) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) return;

    await setDoc(userRef, {
      uid: user.uid,
      fullName: extraData.fullName || user.displayName || "",
      email: user.email || "",
      role: extraData.role || "employee",
      company: extraData.company || "",
      provider,
      photoURL: user.photoURL || "",
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Firestore Error:", error);
    showToast("error", "Unable to save user data.");
  }
}

/* ==========================================================
   NAVIGATION HELPER
========================================================== */

function goToDashboard() {
  setTimeout(() => {
    window.location.href = DASHBOARD_PATH;
  }, 700);
}

/* ==========================================================
   AUTH STATE CHECK
========================================================== */

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  if (!user.emailVerified) return;

  window.location.href = DASHBOARD_PATH;
});

/* ==========================================================
   EMAIL LOGIN
========================================================== */

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
      showToast("error", "Please enter email and password.");
      return;
    }

    try {
      await setPersistence(
        auth,
        rememberMe && rememberMe.checked
          ? browserLocalPersistence
          : browserSessionPersistence,
      );

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      if (!user.emailVerified) {
        showToast("error", "Please verify your email before logging in.");
        await signOut(auth);
        return;
      }

      showToast("success", "Login Successful");
      goToDashboard();
    } catch (error) {
      let message = "Login Failed.";

      switch (error.code) {
        case "auth/invalid-credential":
        case "auth/user-not-found":
          message = "Invalid email or password.";
          break;
        case "auth/wrong-password":
          message = "Incorrect password.";
          break;
        case "auth/invalid-email":
          message = "Invalid email address.";
          break;
        case "auth/too-many-requests":
          message = "Too many attempts. Try again later.";
          break;
        default:
          message = error.message;
      }

      showToast("error", message);
    }
  });
}

/* ==========================================================
   EMAIL SIGNUP
========================================================== */

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = fullNameInput.value.trim();
    const email = signupEmailInput.value.trim();
    const password = signupPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const role = roleSelect.value;
    const company = companyInput.value.trim();

    if (!fullName || !email || !password || !confirmPassword || !role) {
      showToast("error", "Please fill all required fields.");
      return;
    }

    if (password.length < 6) {
      showToast("error", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showToast("error", "Passwords do not match.");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      await createUserDocument(user, "email", { fullName, role, company });
      await sendEmailVerification(user);

      showToast(
        "success",
        "Account created successfully. Please verify your email.",
      );

      signupForm.reset();
      if (roleSelect) roleSelect.selectedIndex = 0;

      document.dispatchEvent(new CustomEvent("role-select:reset"));

      await signOut(auth);

      setTimeout(() => {
        const loginBtn = document.querySelector('[data-switch-view="login"]');
        if (loginBtn) loginBtn.click();
      }, 1200);
    } catch (error) {
      let message = "Signup Failed.";

      switch (error.code) {
        case "auth/email-already-in-use":
          message = "Email already exists.";
          break;
        case "auth/invalid-email":
          message = "Invalid email address.";
          break;
        case "auth/weak-password":
          message = "Password is too weak.";
          break;
        case "auth/network-request-failed":
          message = "Please check your internet connection.";
          break;
        default:
          message = error.message;
      }

      showToast("error", message);
    }
  });
}

/* ==========================================================
   GOOGLE & MICROSOFT AUTHENTICATION
========================================================== */

async function socialLogin(provider, providerName) {
  try {
    const result = await signInWithPopup(auth, provider);
    await createUserDocument(result.user, providerName);

    showToast("success", `${providerName} Login Successful`);
    goToDashboard();
  } catch (error) {
    if (
      error.code === "auth/popup-closed-by-user" ||
      error.code === "auth/cancelled-popup-request"
    ) {
      return;
    }

    if (error.code === "auth/popup-blocked") {
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        showToast("error", redirectError.message);
      }
      return;
    }

    showToast("error", error.message);
  }
}

googleButtons.forEach((button) => {
  button.addEventListener("click", () => socialLogin(googleProvider, "Google"));
});

microsoftButtons.forEach((button) => {
  button.addEventListener("click", () =>
    socialLogin(microsoftProvider, "Microsoft"),
  );
});

/* ==========================================================
   REDIRECT RESULT
========================================================== */

async function checkRedirectLogin() {
  try {
    const result = await getRedirectResult(auth);
    if (!result || !result.user) return;

    const providerName =
      result.providerId === "google.com" ? "Google" : "Microsoft";
    await createUserDocument(result.user, providerName);

    showToast("success", "Login Successful");
    goToDashboard();
  } catch (error) {
    console.error(error);
    showToast("error", error.message);
  }
}

checkRedirectLogin();

/* ==========================================================
   FORGOT PASSWORD
========================================================== */

if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = forgotEmailInput.value.trim();

    if (!email) {
      showToast("error", "Please enter your email.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);

      if (sentEmailLabel) sentEmailLabel.textContent = email;

      showToast("success", "Password reset email sent.");
      document.body.dataset.view = "forgot";
      document.dispatchEvent(new CustomEvent("password-reset:sent"));
    } catch (error) {
      showToast("error", error.message);
    }
  });
}


