import { API_BASE_URL, fetchJson, getAccessToken, setTokens, clearTokens, setTokensFromUrlParams } from "./auth.js";

const noteGrid = document.getElementById("noteGrid");
const createNoteCard = document.getElementById("createNoteCard");
const noticeText = document.querySelector(".notice-bar p");
const guestHomeSection = document.getElementById("guestHomeSection");
const memberWorkspaceSection = document.getElementById("memberWorkspaceSection");
let currentView = "grid";
let currentNotes = [];

function setNotice(message) {
  if (noticeText) {
    noticeText.textContent = message;
  }
}

function setWorkspaceVisibility(isLoggedIn) {
  guestHomeSection?.classList.toggle("is-hidden", isLoggedIn);
  memberWorkspaceSection?.classList.toggle("is-hidden", !isLoggedIn);

  const loginLink = document.getElementById("loginMenuLink");
  const logoutButton = document.getElementById("logoutButton");
  if (loginLink) {
    loginLink.classList.toggle("is-hidden", isLoggedIn);
  }
  if (logoutButton) {
    logoutButton.classList.toggle("is-hidden", !isLoggedIn);
  }
}

function openLoginModal() {
  const loginModalBackdrop = document.getElementById("loginModalBackdrop");
  if (loginModalBackdrop) {
    loginModalBackdrop.classList.add("active");
  }
}

function closeLoginModal() {
  const loginModalBackdrop = document.getElementById("loginModalBackdrop");
  if (loginModalBackdrop) {
    loginModalBackdrop.classList.remove("active");
  }
}

function moveToAnalysisPage(noteId) {
  window.location.href = `analysis.html?note_id=${noteId}`;
}

function createNoteCardElement(note) {
  const card = document.createElement("div");
  card.className = "note-card";
  if (currentView === "list") {
    card.classList.add("list-card");
  }
  card.dataset.noteId = note.note_id;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");

  const thumbnail = document.createElement("div");
  thumbnail.className = "note-thumbnail sample-bg";

  const label = document.createElement("div");
  label.className = "note-label";
  label.textContent = note.title;

  if (currentView === "list") {
    const content = document.createElement("div");
    content.className = "note-content";

    const description = document.createElement("div");
    description.className = "note-description";
    description.textContent = note.description || "설명 없음";

    const meta = document.createElement("div");
    meta.className = "note-meta";
    const createdAt = new Date(note.created_at).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    meta.textContent = `생성됨 ${createdAt}`;

    content.appendChild(label);
    content.appendChild(description);
    content.appendChild(meta);

    card.appendChild(thumbnail);
    card.appendChild(content);
  } else {
    card.appendChild(thumbnail);
    card.appendChild(label);
  }

  card.addEventListener("click", () => {
    moveToAnalysisPage(note.note_id);
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      moveToAnalysisPage(note.note_id);
    }
  });

  return card;
}

function renderNotes(notes, animate = false) {
  currentNotes = notes;
  if (!noteGrid) {
    return;
  }
  const existingCards = noteGrid.querySelectorAll(".note-card:not(.add-card)");
  existingCards.forEach((card) => card.remove());

  notes.forEach((note, index) => {
    const card = createNoteCardElement(note);
    if (animate) {
      card.classList.add("card-entering");
      card.style.animationDelay = `${index * 48}ms`;
    }
    noteGrid.appendChild(card);
  });
}

function updateViewMode() {
  if (!noteGrid || !memberWorkspaceSection || memberWorkspaceSection.classList.contains("is-hidden")) {
    return;
  }

  const addCardElement = document.getElementById("createNoteCard");

  if (currentView === "list") {
    noteGrid.classList.add("list-view");
    if (addCardElement) {
      addCardElement.classList.add("list-card");
    }
  } else {
    noteGrid.classList.remove("list-view");
    if (addCardElement) {
      addCardElement.classList.remove("list-card");
    }
  }
}

function switchView(newView) {
  if (currentView === newView) return;

  noteGrid.classList.add("is-switching");

  setTimeout(() => {
    currentView = newView;
    updateViewMode();
    renderNotes(currentNotes, true);
    noteGrid.classList.remove("is-switching");
  }, 180);
}

async function fetchNotes() {
  if (!getAccessToken()) {
    setWorkspaceVisibility(false);
    setNotice("로그인이 필요합니다. 로그인 후 이용해주세요.");
    return;
  }

  setWorkspaceVisibility(true);
  setNotice("노트 목록을 불러오는 중입니다.");

  const data = await fetchJson(`${API_BASE_URL}/notes`);
  renderNotes(data.items ?? [], true);

  if ((data.total ?? 0) === 0) {
    setNotice("아직 생성된 노트가 없습니다. 새 노트를 추가해보세요.");
    return;
  }

  setNotice(`총 ${data.total}개의 노트를 불러왔습니다.`);
}

function openCreateNoteModal() {
  const createNoteModalBackdrop = document.getElementById("createNoteModalBackdrop");
  const createNoteTitleInput = document.getElementById("createNoteTitleInput");
  const createNoteDescriptionInput = document.getElementById("createNoteDescriptionInput");

  if (createNoteTitleInput) {
    createNoteTitleInput.value = "";
  }
  if (createNoteDescriptionInput) {
    createNoteDescriptionInput.value = "";
  }

  if (createNoteModalBackdrop) {
    createNoteModalBackdrop.classList.add("active");
  }
}

function closeCreateNoteModal() {
  const createNoteModalBackdrop = document.getElementById("createNoteModalBackdrop");
  if (createNoteModalBackdrop) {
    createNoteModalBackdrop.classList.remove("active");
  }
}

async function createNote() {
  if (!getAccessToken()) {
    openLoginModal();
    setNotice("로그인이 필요합니다. 노트를 생성하려면 로그인해주세요.");
    return;
  }

  openCreateNoteModal();
}

async function submitCreateNote() {
  const titleInput = document.getElementById("createNoteTitleInput");
  const descriptionInput = document.getElementById("createNoteDescriptionInput");
  const title = titleInput?.value.trim() || "";
  const description = descriptionInput?.value.trim() || null;

  if (!title) {
    window.alert("노트 제목을 입력해주세요.");
    titleInput?.focus();
    return;
  }

  setNotice("새 노트를 생성하는 중입니다.");
  createNoteCard.style.pointerEvents = "none";
  createNoteCard.style.opacity = "0.6";

  try {
    const createdNote = await fetchJson(`${API_BASE_URL}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        description,
      }),
    });
    setNotice("새 노트를 생성했습니다. 분석 페이지로 이동합니다.");
    closeCreateNoteModal();
    moveToAnalysisPage(createdNote.note_id);
  } catch (error) {
    console.error(error);
    setNotice("노트 생성 중 오류가 발생했습니다.");
    window.alert("노트 생성에 실패했습니다. 서버가 켜져 있는지 확인해주세요.");
  } finally {
    createNoteCard.style.pointerEvents = "auto";
    createNoteCard.style.opacity = "1";
  }
}

function openLogoutConfirmModal() {
  const logoutConfirmModalBackdrop = document.getElementById("logoutConfirmModalBackdrop");
  if (logoutConfirmModalBackdrop) {
    logoutConfirmModalBackdrop.classList.add("active");
  }
}

function closeLogoutConfirmModal() {
  const logoutConfirmModalBackdrop = document.getElementById("logoutConfirmModalBackdrop");
  if (logoutConfirmModalBackdrop) {
    logoutConfirmModalBackdrop.classList.remove("active");
  }
}

async function doLogout() {
  clearTokens();
  setWorkspaceVisibility(false);
  currentNotes = [];
  renderNotes([]);
  setNotice("로그아웃 되었습니다.");
  closeLogoutConfirmModal();
}

async function doLogin(payload) {
  const tokens = await fetchJson(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  setTokens(tokens);
  updateLoginLink();
  setNotice("로그인이 완료되었습니다.");
  closeLoginModal();
  await fetchNotes();
}

function setupLoginModal() {
  const loginModal = document.getElementById("loginModalBackdrop");
  const closeButton = document.getElementById("closeLoginModalButton");
  const loginLink = document.getElementById("loginMenuLink");
  const loginForm = document.getElementById("loginForm");
  const googleLoginButton = document.querySelector(".signup-links button:nth-child(1)");
  const heroLoginButton = document.getElementById("heroLoginButton");
  const heroGoogleButton = document.getElementById("heroGoogleButton");

  if (loginLink) {
    loginLink.addEventListener("click", async (e) => {
      e.preventDefault();
      openLoginModal();
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeLoginModal);
  }

  if (loginModal) {
    loginModal.addEventListener("click", (e) => {
      if (e.target === loginModal) {
        closeLoginModal();
      }
    });
  }

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
    if (loginSubmitButton) {
      loginSubmitButton.addEventListener("click", async (e) => {
        e.preventDefault();
        await submitLoginForm();
      });
    }
  }

  if (googleLoginButton) {
    googleLoginButton.addEventListener("click", () => {
      window.location.href = `${API_BASE_URL}/auth/oauth/login?provider=google`;
    });
  }

  heroLoginButton?.addEventListener("click", openLoginModal);
  heroGoogleButton?.addEventListener("click", () => {
    window.location.href = `${API_BASE_URL}/auth/oauth/login?provider=google`;
  });
}

function setupCreateNoteModal() {
  const createNoteModal = document.getElementById("createNoteModalBackdrop");
  const closeCreateNoteModalButton = document.getElementById("closeCreateNoteModalButton");
  const cancelCreateNoteButton = document.getElementById("cancelCreateNoteButton");
  const confirmCreateNoteButton = document.getElementById("confirmCreateNoteButton");

  if (createNoteModal) {
    createNoteModal.addEventListener("click", (e) => {
      if (e.target === createNoteModal) {
        closeCreateNoteModal();
      }
    });
  }

  if (closeCreateNoteModalButton) {
    closeCreateNoteModalButton.addEventListener("click", closeCreateNoteModal);
  }

  if (cancelCreateNoteButton) {
    cancelCreateNoteButton.addEventListener("click", closeCreateNoteModal);
  }

  if (confirmCreateNoteButton) {
    confirmCreateNoteButton.addEventListener("click", submitCreateNote);
  }
}

function setupLogoutModal() {
  const logoutButton = document.getElementById("logoutButton");
  const logoutConfirmModal = document.getElementById("logoutConfirmModalBackdrop");
  const cancelLogoutButton = document.getElementById("cancelLogoutButton");
  const confirmLogoutButton = document.getElementById("confirmLogoutButton");

  if (logoutButton) {
    logoutButton.addEventListener("click", openLogoutConfirmModal);
  }

  if (logoutConfirmModal) {
    logoutConfirmModal.addEventListener("click", (e) => {
      if (e.target === logoutConfirmModal) {
        closeLogoutConfirmModal();
      }
    });
  }

  if (cancelLogoutButton) {
    cancelLogoutButton.addEventListener("click", closeLogoutConfirmModal);
  }

  if (confirmLogoutButton) {
    confirmLogoutButton.addEventListener("click", doLogout);
  }
}

function setupViewToggle() {
  const gridButton = document.querySelector(".view-toggle button:nth-child(1)");
  const listButton = document.querySelector(".view-toggle button:nth-child(2)");

  if (gridButton && listButton) {
    gridButton.addEventListener("click", () => {
      gridButton.classList.add("active");
      listButton.classList.remove("active");
      switchView("grid");
    });

    listButton.addEventListener("click", () => {
      listButton.classList.add("active");
      gridButton.classList.remove("active");
      switchView("list");
    });
  }
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
      const pct = (parseFloat(progressFill.style.width) || 0);
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

async function initNotePage() {
  if (!noteGrid || !createNoteCard) {
    return;
  }

  const restored = setTokensFromUrlParams();
  if (restored) {
    setNotice("Google 로그인이 완료되었습니다.");
  }

  initBanner();
  setWorkspaceVisibility(Boolean(getAccessToken()));
  createNoteCard.addEventListener("click", createNote);
  setupLoginModal();
  setupLogoutModal();
  setupViewToggle();
  setupCreateNoteModal();
  const gridButton = document.querySelector(".view-toggle button:nth-child(1)");
  gridButton?.classList.add("active");
  updateViewMode();

  if (!getAccessToken()) {
    setNotice("로그인 후 내 노트 목록과 새 노트 추가 기능을 사용할 수 있습니다.");
    return;
  }

  try {
    await fetchNotes();
  } catch (error) {
    console.error(error);
    setNotice("노트 목록을 불러오지 못했습니다. 백엔드 서버 상태를 확인해주세요.");
  }
}

document.addEventListener("DOMContentLoaded", initNotePage);
