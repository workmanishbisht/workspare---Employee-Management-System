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
  signOut,
  OAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ==========================================================
   CONSTANTS
========================================================== */

const DASHBOARD_PATH = "./pages/dashboard.html";
const ADMIN_ROLE = "admin";

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
const companyInput = document.getElementById("companyInput");
const roleSelect = document.getElementById("roleSelect");
if (roleSelect) {
  const roleField = roleSelect.closest(".form-group") || roleSelect;
  roleField.style.display = "none";
  roleSelect.removeAttribute("required");
}

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
   MICROSOFT PROFILE PHOTO (via Microsoft Graph API)
========================================================== */

async function fetchMicrosoftPhoto(accessToken) {
  if (!accessToken) return "";

  try {
    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me/photo/$value",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok) return "";

    const blob = await res.blob();

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Microsoft photo fetch skipped:", error.message);
    return "";
  }
}

/* ==========================================================
   FIRESTORE USER HELPER (Admin-only, dev phase)
========================================================== */

async function createOrUpdateAdminUser(user, provider, extraData = {}) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const resolvedPhotoURL = extraData.photoURL || user.photoURL || "";

    if (userSnap.exists()) {
      const updatePayload = {
        role: ADMIN_ROLE,
        updatedAt: serverTimestamp(),
      };

      if (resolvedPhotoURL) {
        updatePayload.photoURL = resolvedPhotoURL;
      }

      await setDoc(userRef, updatePayload, { merge: true });
      return;
    }

    await setDoc(userRef, {
      uid: user.uid,
      fullName: extraData.fullName || user.displayName || "",
      email: user.email || "",
      photoURL: resolvedPhotoURL,
      provider,
      role: ADMIN_ROLE,
      company: extraData.company || "",
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Firestore Error:", error);

    if (error.code === "permission-denied") {
      showToast("error", "Permission denied while saving user data.");
    } else {
      showToast("error", "Unable to save user data.");
    }
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

      await createOrUpdateAdminUser(user, "email");

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
   EMAIL SIGNUP (Admin-only)
========================================================== */

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = fullNameInput.value.trim();
    const email = signupEmailInput.value.trim();
    const password = signupPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const company = companyInput ? companyInput.value.trim() : "";

    if (!fullName || !email || !password || !confirmPassword) {
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

      await createOrUpdateAdminUser(user, "email", { fullName, company });
      await sendEmailVerification(user);

      showToast(
        "success",
        "Account created successfully. Please verify your email.",
      );

      signupForm.reset();

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
   GOOGLE & MICROSOFT AUTHENTICATION (Admin-only)
========================================================== */

async function socialLogin(provider, providerName) {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    let photoURL = user.photoURL || "";

    if (providerName === "Microsoft") {
      const credential = OAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      const graphPhoto = await fetchMicrosoftPhoto(accessToken);
      if (graphPhoto) photoURL = graphPhoto;
    }

    await createOrUpdateAdminUser(user, providerName, { photoURL });

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

    if (error.code === "auth/network-request-failed") {
      showToast("error", "Please check your internet connection.");
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
   REDIRECT RESULT (Admin-only)
========================================================== */

async function checkRedirectLogin() {
  try {
    const result = await getRedirectResult(auth);
    if (!result || !result.user) return;

    const providerName =
      result.providerId === "google.com" ? "Google" : "Microsoft";

    let photoURL = result.user.photoURL || "";

    if (providerName === "Microsoft") {
      const credential = OAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      const graphPhoto = await fetchMicrosoftPhoto(accessToken);
      if (graphPhoto) photoURL = graphPhoto;
    }

    await createOrUpdateAdminUser(result.user, providerName, { photoURL });

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
      let message = error.message;

      if (error.code === "auth/network-request-failed") {
        message = "Please check your internet connection.";
      } else if (error.code === "auth/invalid-email") {
        message = "Invalid email address.";
      } else if (error.code === "auth/user-not-found") {
        message = "No account found with this email.";
      }

      showToast("error", message);
    }
  });
}
