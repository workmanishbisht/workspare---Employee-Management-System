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
const DEFAULT_SOCIAL_ROLE = "employee";
const VALID_ROLES = ["admin", "hr", "manager", "employee"];

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

// Role selection is required for multi-role signup — make sure it is
// visible and enforced (a previous version of this file hid it and
// force-assigned "admin" to every account).
if (roleSelect) {
  const roleField = roleSelect.closest(".form-group") || roleSelect;
  roleField.style.display = "";
  roleSelect.setAttribute("required", "required");
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
   BUTTON LOADING / DOUBLE-SUBMIT PROTECTION
========================================================== */

function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.innerHTML;
    }
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = loadingText;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

function getSubmitButton(form) {
  return form ? form.querySelector('button[type="submit"]') : null;
}

/* ==========================================================
   VALIDATION HELPERS
========================================================== */

function validateFullName(name) {
  if (!name) {
    return { valid: false, message: "Full name is required." };
  }
  if (name.length < 3 || name.length > 50) {
    return {
      valid: false,
      message: "Full name must be between 3 and 50 characters.",
    };
  }
  if (!/^[A-Za-z\s]+$/.test(name)) {
    return {
      valid: false,
      message: "Full name can only contain letters and spaces.",
    };
  }
  return { valid: true, message: "" };
}

function validateEmail(email) {
  if (!email) {
    return { valid: false, message: "Email is required." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, message: "Invalid email address." };
  }
  return { valid: true, message: "" };
}

function validatePassword(password) {
  if (!password) {
    return { valid: false, message: "Password is required." };
  }
  if (password.length < 8 || password.length > 32) {
    return {
      valid: false,
      message: "Password must be between 8 and 32 characters.",
    };
  }
  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
  if (!strongPasswordRegex.test(password)) {
    return {
      valid: false,
      message:
        "Password must contain at least one uppercase, one lowercase, one number and one special character.",
    };
  }
  return { valid: true, message: "" };
}

function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword) {
    return { valid: false, message: "Please confirm your password." };
  }
  if (password !== confirmPassword) {
    return { valid: false, message: "Passwords do not match." };
  }
  return { valid: true, message: "" };
}

function validateRole(role) {
  if (!role) {
    return { valid: false, message: "Role is required." };
  }
  if (!VALID_ROLES.includes(role)) {
    return { valid: false, message: "Please select a valid role." };
  }
  return { valid: true, message: "" };
}

function sanitizeCompany(company) {
  const trimmed = (company || "").trim();
  return trimmed.slice(0, 100);
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
   FIRESTORE USER HELPER (multi-role)

   Behavior:
   - If the user document already exists, role is NEVER included
     in the update payload, so it can never be overwritten on
     login or on a repeat social sign-in.
   - If the user document does not exist yet, it is created with
     the role supplied in extraData.role (signup flow), falling
     back to "employee" for brand-new social logins.
========================================================== */

async function createOrUpdateUser(user, provider, extraData = {}) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const resolvedPhotoURL = extraData.photoURL || user.photoURL || "";

    if (userSnap.exists()) {
      const updatePayload = {
        updatedAt: serverTimestamp(),
        emailVerified: user.emailVerified,
      };

      if (resolvedPhotoURL) {
        updatePayload.photoURL = resolvedPhotoURL;
      }

      // Role is intentionally omitted here — existing role is preserved.
      await setDoc(userRef, updatePayload, { merge: true });
      return userSnap.data().role;
    }

    const roleToSave = (extraData.role || DEFAULT_SOCIAL_ROLE).toLowerCase();

    await setDoc(userRef, {
      uid: user.uid,
      fullName: extraData.fullName || user.displayName || "",
      email: user.email || "",
      role: roleToSave,
      company: extraData.company || "",
      provider,
      status: "Active",
      photoURL: resolvedPhotoURL,
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return roleToSave;
  } catch (error) {
    console.error("Firestore Error:", error);

    if (error.code === "permission-denied") {
      showToast("error", "Permission denied while saving user data.");
    } else {
      showToast("error", "Unable to save user data.");
    }

    throw error;
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

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      showToast("error", emailCheck.message);
      return;
    }

    if (!password) {
      showToast("error", "Password is required.");
      return;
    }

    const submitBtn = getSubmitButton(loginForm);
    setButtonLoading(submitBtn, true, "Logging in...");

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

      // Role is read from Firestore and never overwritten here.
      await createOrUpdateUser(user, "email");

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
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

/* ==========================================================
   EMAIL SIGNUP (multi-role)
========================================================== */

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = fullNameInput.value.trim();
    const email = signupEmailInput.value.trim();
    const password = signupPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const company = sanitizeCompany(companyInput ? companyInput.value : "");
    const selectedRole = roleSelect
      ? roleSelect.value.trim().toLowerCase()
      : "";

    const nameCheck = validateFullName(fullName);
    if (!nameCheck.valid) {
      showToast("error", nameCheck.message);
      return;
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      showToast("error", emailCheck.message);
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      showToast("error", passwordCheck.message);
      return;
    }

    const confirmCheck = validateConfirmPassword(password, confirmPassword);
    if (!confirmCheck.valid) {
      showToast("error", confirmCheck.message);
      return;
    }

    const roleCheck = validateRole(selectedRole);
    if (!roleCheck.valid) {
      showToast("error", roleCheck.message);
      return;
    }

    const submitBtn = getSubmitButton(signupForm);
    setButtonLoading(submitBtn, true, "Creating account...");

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      // Selected role is saved as-is and is never forced to "admin".
      await createOrUpdateUser(user, "email", {
        fullName,
        company,
        role: selectedRole,
      });

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
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

/* ==========================================================
   GOOGLE & MICROSOFT AUTHENTICATION (multi-role)
========================================================== */

async function socialLogin(provider, providerName, triggerButton) {
  setButtonLoading(triggerButton, true, "Connecting...");

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

    // Existing users keep their stored role. Brand-new social users
    // default to "employee" unless the application supplies another role.
    await createOrUpdateUser(user, providerName, {
      photoURL,
      role: DEFAULT_SOCIAL_ROLE,
    });

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
  } finally {
    setButtonLoading(triggerButton, false);
  }
}

googleButtons.forEach((button) => {
  button.addEventListener("click", () =>
    socialLogin(googleProvider, "Google", button),
  );
});

microsoftButtons.forEach((button) => {
  button.addEventListener("click", () =>
    socialLogin(microsoftProvider, "Microsoft", button),
  );
});

/* ==========================================================
   REDIRECT RESULT (multi-role)
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

    await createOrUpdateUser(result.user, providerName, {
      photoURL,
      role: DEFAULT_SOCIAL_ROLE,
    });

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

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      showToast("error", emailCheck.message);
      return;
    }

    const submitBtn = getSubmitButton(forgotForm);
    setButtonLoading(submitBtn, true, "Sending...");

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
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}
