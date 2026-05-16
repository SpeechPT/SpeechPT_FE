import { API_BASE_URL, fetchJson, getAccessToken, setTokens, clearTokens, setTokensFromUrlParams } from "./auth.js";

const noticeText = document.querySelector(".notice-bar p");
const guestHomeSection = document.getElementById("guestHomeSection");

function setNotice(message) {
  if (noticeText) noticeText.textContent = message;
}

function setLandingState(isLoggedIn) {
  if (isLoggedIn) {
    guestHomeSection?.classList.add("is-logged-in");
    const h1 = guestHomeSection?.querySelector(".landing-copy h1");
    if (h1) h1.textContent = "내 발표 기록을 확인하고 다음 발표를 준비하세요";
    const eyebrow = guestHomeSection?.querySelector(".landing-eyebrow");
    if (eyebrow) eyebrow.textContent = "MY WORKSPACE";
  } else {
    guestHomeSection?.classList.remove("is-logged-in");
  }

  const loginLink = document.getElementById("loginMenuLink");
  const logoutButton = document.getElementById("logoutButton");
  if (loginLink) loginLink.classList.toggle("is-hidden", isLoggedIn);
  if (logoutButton) logoutButton.classList.toggle("is-hidden", !isLoggedIn);
}

function updateDashboard(notes) {
  const countEl = document.getElementById("dashboardNoteCount");
  const listEl = document.getElementById("dashboardNoteList");
  if (countEl) countEl.textContent = `총 ${notes.length}개`;
  if (!listEl) return;

  listEl.innerHTML = "";
  if (notes.length === 0) {
    listEl.innerHTML = '<li class="dashboard-note-empty">아직 노트가 없습니다. 노트를 추가해보세요.</li>';
    return;
  }

  [...notes].reverse().slice(0, 6).forEach((note) => {
    const li = document.createElement("li");
    li.className = "dashboard-note-item";
    const date = new Date(note.created_at).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    li.innerHTML = `
      <div class="dashboard-note-thumb"></div>
      <div class="dashboard-note-info">
        <div class="dashboard-note-title">${note.title}</div>
        <div class="dashboard-note-date">${date}</div>
      </div>
    `;
    li.addEventListener("click", () => {
      window.location.href = `analysis.html?note_id=${note.note_id}`;
    });
    listEl.appendChild(li);
  });
}

async function fetchAndUpdateDashboard() {
  try {
    const data = await fetchJson(`${API_BASE_URL}/notes`);
    updateDashboard(data.items ?? []);
  } catch (err) {
    console.error("노트 목록 로드 실패:", err);
  }
}

function openLoginModal() {
  document.getElementById("loginModalBackdrop")?.classList.add("active");
}

function closeLoginModal() {
  document.getElementById("loginModalBackdrop")?.classList.remove("active");
}

async function doLogin(payload) {
  const tokens = await fetchJson(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  setTokens(tokens);
  setLandingState(true);
  setNotice("로그인이 완료되었습니다.");
  closeLoginModal();
  await fetchAndUpdateDashboard();
}

function setupLoginModal() {
  const loginModal = document.getElementById("loginModalBackdrop");
  const closeButton = document.getElementById("closeLoginModalButton");
  const loginLink = document.getElementById("loginMenuLink");
  const loginForm = document.getElementById("loginForm");
  const googleLoginButton = document.querySelector(".signup-links button:nth-child(1)");
  const heroLoginButton = document.getElementById("heroLoginButton");
  const heroGoogleButton = document.getElementById("heroGoogleButton");

  loginLink?.addEventListener("click", (e) => {
    e.preventDefault();
    openLoginModal();
  });

  closeButton?.addEventListener("click", closeLoginModal);

  loginModal?.addEventListener("click", (e) => {
    if (e.target === loginModal) closeLoginModal();
  });

  function isGoogleEmail(email) {
    return typeof email === "string" && email.trim().toLowerCase().endsWith("@gmail.com");
  }

  async function submitLoginForm() {
    const email = loginForm.querySelector("input[type='email']").value;
    const password = loginForm.querySelector("input[type='password']").value;
    if (isGoogleEmail(email)) {
      const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
      window.location.href = `${API_BASE_URL}/auth/oauth/login?provider=google&login_hint=${encodedEmail}&auto=true`;
      return;
    }
    try {
      await doLogin({ email, password, provider: "local" });
    } catch (error) {
      console.error(error);
      window.alert("로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.");
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await submitLoginForm();
    });
    const loginSubmitButton = loginForm.querySelector("button[type='submit']");
    loginSubmitButton?.addEventListener("click", async (e) => {
      e.preventDefault();
      await submitLoginForm();
    });
  }

  googleLoginButton?.addEventListener("click", () => {
    window.location.href = `${API_BASE_URL}/auth/oauth/login?provider=google`;
  });

  heroLoginButton?.addEventListener("click", openLoginModal);
  heroGoogleButton?.addEventListener("click", () => {
    window.location.href = `${API_BASE_URL}/auth/oauth/login?provider=google`;
  });
}

function setupLogoutModal() {
  const logoutButton = document.getElementById("logoutButton");
  const logoutConfirmModal = document.getElementById("logoutConfirmModalBackdrop");
  const cancelLogoutButton = document.getElementById("cancelLogoutButton");
  const confirmLogoutButton = document.getElementById("confirmLogoutButton");

  logoutButton?.addEventListener("click", () => {
    logoutConfirmModal?.classList.add("active");
  });

  logoutConfirmModal?.addEventListener("click", (e) => {
    if (e.target === logoutConfirmModal) logoutConfirmModal.classList.remove("active");
  });

  cancelLogoutButton?.addEventListener("click", () => {
    logoutConfirmModal?.classList.remove("active");
  });

  confirmLogoutButton?.addEventListener("click", () => {
    clearTokens();
    setLandingState(false);
    logoutConfirmModal?.classList.remove("active");
    setNotice("로그아웃 되었습니다.");
  });
}

function initBanner() {
  const banner = document.getElementById("landingBanner");
  if (!banner) return;

  const track = document.getElementById("bannerTrack");
  const progressFill = document.getElementById("bannerProgressFill");
  const dots = banner.querySelectorAll(".banner-dot");
  const TOTAL = dots.length;
  const INTERVAL = 5000;
  let current = 0;
  let timer = null;

  function goTo(index) {
    current = ((index % TOTAL) + TOTAL) % TOTAL;
    if (track) track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("active", i === current));
    resetProgress();
  }

  function resetProgress() {
    if (!progressFill) return;
    progressFill.style.transition = "none";
    progressFill.style.width = "0%";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        progressFill.style.transition = `width ${INTERVAL}ms linear`;
        progressFill.style.width = "100%";
      });
    });
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), INTERVAL);
  }

  banner.querySelector("#bannerNext")?.addEventListener("click", () => {
    goTo(current + 1);
    startTimer();
  });

  banner.querySelector("#bannerPrev")?.addEventListener("click", () => {
    goTo(current - 1);
    startTimer();
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      goTo(Number(dot.dataset.index));
      startTimer();
    });
  });

  banner.addEventListener("mouseenter", () => {
    clearInterval(timer);
    if (progressFill) {
      const pct = parseFloat(progressFill.style.width) || 0;
      progressFill.style.transition = "none";
      progressFill.style.width = pct + "%";
    }
  });

  banner.addEventListener("mouseleave", () => {
    goTo(current);
    startTimer();
  });

  goTo(0);
  startTimer();
}

async function initIndexPage() {
  const restored = setTokensFromUrlParams();
  if (restored) setNotice("Google 로그인이 완료되었습니다.");

  initBanner();

  const isLoggedIn = Boolean(getAccessToken());
  setLandingState(isLoggedIn);
  setupLoginModal();
  setupLogoutModal();

  if (isLoggedIn) {
    await fetchAndUpdateDashboard();
  }

  document.querySelector(".logo-img")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.getElementById("scrollToWorkspaceBtn")?.addEventListener("click", () => {
    window.location.href = "note.html";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initIndexPage();
});
