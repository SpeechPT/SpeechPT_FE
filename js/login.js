import { API_BASE_URL, setTokensFromUrlParams } from "./auth.js";

function redirectToGoogleLogin() {
  window.location.href = `${API_BASE_URL}/auth/oauth/login?provider=google`;
}

function initLoginPage() {
  const googleLoginButton = document.getElementById("googleLoginButton");

  if (setTokensFromUrlParams()) {
    window.location.href = "./note.html";
    return;
  }

  googleLoginButton?.addEventListener("click", redirectToGoogleLogin);
}

document.addEventListener("DOMContentLoaded", initLoginPage);
