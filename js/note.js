import { API_BASE_URL, fetchJson, getAccessToken, clearTokens } from "./auth.js";

const noteGrid = document.getElementById("noteGrid");
const createNoteCard = document.getElementById("createNoteCard");
const noticeText = document.querySelector(".notice-bar p");
let currentView = "grid";
let currentNotes = [];

function setNotice(message) {
  if (noticeText) noticeText.textContent = message;
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

  card.addEventListener("click", () => moveToAnalysisPage(note.note_id));
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
  if (!noteGrid) return;
  noteGrid.querySelectorAll(".note-card:not(.add-card)").forEach((card) => card.remove());

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
  const addCardElement = document.getElementById("createNoteCard");
  if (currentView === "list") {
    noteGrid?.classList.add("list-view");
    addCardElement?.classList.add("list-card");
  } else {
    noteGrid?.classList.remove("list-view");
    addCardElement?.classList.remove("list-card");
  }
}

function switchView(newView) {
  if (currentView === newView) return;
  noteGrid?.classList.add("is-switching");
  setTimeout(() => {
    currentView = newView;
    updateViewMode();
    renderNotes(currentNotes, true);
    noteGrid?.classList.remove("is-switching");
  }, 180);
}

async function fetchNotes() {
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
  const titleInput = document.getElementById("createNoteTitleInput");
  const descInput = document.getElementById("createNoteDescriptionInput");
  if (titleInput) titleInput.value = "";
  if (descInput) descInput.value = "";
  document.getElementById("createNoteModalBackdrop")?.classList.add("active");
}

function closeCreateNoteModal() {
  document.getElementById("createNoteModalBackdrop")?.classList.remove("active");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
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

function setupCreateNoteModal() {
  const createNoteModal = document.getElementById("createNoteModalBackdrop");
  createNoteModal?.addEventListener("click", (e) => {
    if (e.target === createNoteModal) closeCreateNoteModal();
  });
  document.getElementById("closeCreateNoteModalButton")?.addEventListener("click", closeCreateNoteModal);
  document.getElementById("cancelCreateNoteButton")?.addEventListener("click", closeCreateNoteModal);
  document.getElementById("confirmCreateNoteButton")?.addEventListener("click", submitCreateNote);
}

function setupLogoutModal() {
  const logoutConfirmModal = document.getElementById("logoutConfirmModalBackdrop");
  document.getElementById("logoutButton")?.addEventListener("click", () => {
    logoutConfirmModal?.classList.add("active");
  });
  logoutConfirmModal?.addEventListener("click", (e) => {
    if (e.target === logoutConfirmModal) logoutConfirmModal.classList.remove("active");
  });
  document.getElementById("cancelLogoutButton")?.addEventListener("click", () => {
    logoutConfirmModal?.classList.remove("active");
  });
  document.getElementById("confirmLogoutButton")?.addEventListener("click", () => {
    clearTokens();
    window.location.href = "index.html";
  });
}

function setupViewToggle() {
  const gridButton = document.querySelector(".view-toggle button:nth-child(1)");
  const listButton = document.querySelector(".view-toggle button:nth-child(2)");
  gridButton?.addEventListener("click", () => {
    gridButton.classList.add("active");
    listButton?.classList.remove("active");
    switchView("grid");
  });
  listButton?.addEventListener("click", () => {
    listButton.classList.add("active");
    gridButton?.classList.remove("active");
    switchView("list");
  });
}

async function initNotePage() {
  if (!getAccessToken()) {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("logoutButton")?.classList.remove("is-hidden");

  createNoteCard?.addEventListener("click", openCreateNoteModal);
  setupCreateNoteModal();
  setupLogoutModal();
  setupViewToggle();

  const gridButton = document.querySelector(".view-toggle button:nth-child(1)");
  gridButton?.classList.add("active");
  updateViewMode();

  try {
    await fetchNotes();
  } catch (error) {
    console.error(error);
    setNotice("노트 목록을 불러오지 못했습니다. 백엔드 서버 상태를 확인해주세요.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initNotePage();
  document.querySelector(".logo-img")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
