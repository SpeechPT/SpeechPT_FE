import {
  fetchNoteDetail as fetchNoteDetailService,
  fetchAnalysisResult as fetchAnalysisResultService,
  pollAnalysisStatus as pollAnalysisStatusService,
  runAnalysis as runAnalysisService,
} from "./analysis-service.js";
import {
  setNotice,
  setButtonDisabled,
  renderAttachedFileChip,
  renderDocumentPreview,
  addMessageToChat,
  updateAnalysisStatusMessage,
  clearAnalysisStatusMessage,
  getSelectedAttachments,
  clearSelectedFiles,
  renderEmptyResult,
} from "./analysis-render.js";
import { setupDragAndDrop, bindInputListeners } from "./analysis-chat.js";
import { initPracticeMode, openPracticeModal } from "./practice-mode.js";

const params = new URLSearchParams(window.location.search);
const noteId = params.get("note_id");

const elements = {
  layoutElement: document.querySelector(".analysis-layout"),
  leftPanelElement: document.querySelector(".left-panel"),
  centerPanelElement: document.querySelector(".center-panel"),
  rightPanelElement: document.querySelector(".right-panel"),
  slidePreviewElement: document.querySelector(".slide-preview"),
  transcriptBoxElement: document.querySelector(".transcript-box"),
  rightPrimaryCardElement: document.querySelector(".score-card-primary"),
  rightSecondaryCardElement: document.querySelector(".score-card-secondary"),
  rightPracticeCardElement: document.querySelector(".practice-card"),
  leftCenterResizer: document.getElementById("leftCenterResizer"),
  centerRightResizer: document.getElementById("centerRightResizer"),
  leftVerticalResizer: document.getElementById("leftVerticalResizer"),
  rightTopResizer: document.getElementById("rightTopResizer"),
  rightBottomResizer: document.getElementById("rightBottomResizer"),
  noteTitleElement: document.getElementById("noteTitle"),
  noteDescriptionElement: document.getElementById("noteDescription"),
  noticeText: document.querySelector(".notice-bar p"),
  documentInput: document.getElementById("documentFile"),
  audioInput: document.getElementById("audioFile"),
  attachedFilesContainer: document.getElementById("attachedFiles"),
  documentPreviewElement: document.getElementById("documentPreview"),
  filePicker: document.getElementById("filePicker"),
  attachFileButton: document.getElementById("attachFileButton"),
  runAnalysisButton: document.getElementById("runAnalysisButton"),
  practiceModeButton: document.getElementById("practiceModeButton"),
  contentCoverageElement: document.getElementById("contentCoverageScore"),
  deliveryStabilityElement: document.getElementById("deliveryStabilityScore"),
  pacingScoreElement: document.getElementById("pacingScore"),
  summaryElement: document.getElementById("analysisSummary"),
  strengthsListElement: document.getElementById("strengthsList"),
  improvementsListElement: document.getElementById("improvementsList"),
  sectionsListElement: document.getElementById("sectionsList"),
  chatBodyElement: document.querySelector(".chat-body"),
};

let analysisStatusMessage = null;
let documentUploadId = null;
let audioUploadId = null;
let analysisId = null;
let pollingTimer = null;
let documentPreviewUrl = null;
let latestAnalysisScores = null;

function setPanelWidth(panel, widthPx) {
  if (!panel) {
    return;
  }

  panel.style.flex = `0 0 ${Math.round(widthPx)}px`;
}

function setPanelHeight(panel, heightPx) {
  if (!panel) {
    return;
  }

  panel.style.flex = `0 0 ${Math.round(heightPx)}px`;
}

function setupPanelResizer(resizer, leftPanel, rightPanel) {
  if (!resizer || !leftPanel || !rightPanel || !elements.layoutElement) {
    return;
  }

  const minPanelWidth = 280;
  let startX = 0;
  let startLeftWidth = 0;
  let startRightWidth = 0;

  function onPointerMove(event) {
    const deltaX = event.clientX - startX;
    const nextLeftWidth = startLeftWidth + deltaX;
    const nextRightWidth = startRightWidth - deltaX;

    if (nextLeftWidth < minPanelWidth || nextRightWidth < minPanelWidth) {
      return;
    }

    setPanelWidth(leftPanel, nextLeftWidth);
    setPanelWidth(rightPanel, nextRightWidth);
  }

  function stopResize() {
    resizer.classList.remove("is-active");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopResize);
  }

  resizer.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 1200) {
      return;
    }

    startX = event.clientX;
    startLeftWidth = leftPanel.getBoundingClientRect().width;
    startRightWidth = rightPanel.getBoundingClientRect().width;

    resizer.classList.add("is-active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
  });
}

function setupVerticalResizer(resizer, topPanel, bottomPanel) {
  if (!resizer || !topPanel || !bottomPanel) {
    return;
  }

  const minPanelHeight = 140;
  let startY = 0;
  let startTopHeight = 0;
  let startBottomHeight = 0;

  function onPointerMove(event) {
    const deltaY = event.clientY - startY;
    const nextTopHeight = startTopHeight + deltaY;
    const nextBottomHeight = startBottomHeight - deltaY;

    if (nextTopHeight < minPanelHeight || nextBottomHeight < minPanelHeight) {
      return;
    }

    setPanelHeight(topPanel, nextTopHeight);
    setPanelHeight(bottomPanel, nextBottomHeight);
  }

  function stopResize() {
    resizer.classList.remove("is-active");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopResize);
  }

  resizer.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 1200) {
      return;
    }

    startY = event.clientY;
    startTopHeight = topPanel.getBoundingClientRect().height;
    startBottomHeight = bottomPanel.getBoundingClientRect().height;

    resizer.classList.add("is-active");
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
  });
}

function initPanelResizers() {
  setupPanelResizer(
    elements.leftCenterResizer,
    elements.leftPanelElement,
    elements.centerPanelElement
  );
  setupPanelResizer(
    elements.centerRightResizer,
    elements.centerPanelElement,
    elements.rightPanelElement
  );
  setupVerticalResizer(
    elements.leftVerticalResizer,
    elements.slidePreviewElement,
    elements.transcriptBoxElement
  );
  setupVerticalResizer(
    elements.rightTopResizer,
    elements.rightPrimaryCardElement,
    elements.rightSecondaryCardElement
  );
  setupVerticalResizer(
    elements.rightBottomResizer,
    elements.rightSecondaryCardElement,
    elements.rightPracticeCardElement
  );
}

function revokeDocumentPreviewUrl() {
  if (!documentPreviewUrl) {
    return;
  }

  URL.revokeObjectURL(documentPreviewUrl);
  documentPreviewUrl = null;
}

function updateDocumentPreview(file) {
  revokeDocumentPreviewUrl();

  if (!file) {
    renderDocumentPreview(elements.documentPreviewElement, null, null);
    return;
  }

  const lowerName = file.name.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf") || file.type === "application/pdf";

  if (isPdf) {
    documentPreviewUrl = URL.createObjectURL(file);
  }

  renderDocumentPreview(elements.documentPreviewElement, file, documentPreviewUrl);
}

function updateNotice(message) {
  setNotice(elements.noticeText, message);
}

function updateAnalysisChatStatus(text) {
  analysisStatusMessage = updateAnalysisStatusMessage(
    elements.chatBodyElement,
    text,
    analysisStatusMessage
  );
}

function resetAnalysisChatStatus() {
  analysisStatusMessage = clearAnalysisStatusMessage(analysisStatusMessage);
}

function removeAttachedFile(kind) {
  const dt = new DataTransfer();

  if (kind === "document") {
    elements.documentInput.files = dt.files;
    documentUploadId = null;
    updateDocumentPreview(null);
  }

  if (kind === "audio") {
    elements.audioInput.files = dt.files;
    audioUploadId = null;
  }

  renderAttachedFileChip(elements.attachedFilesContainer, kind, null, removeAttachedFile);
}

function onFileChanged(kind, file) {
  if (kind === "document") {
    documentUploadId = null;
    updateDocumentPreview(file);
  }

  if (kind === "audio") {
    audioUploadId = null;
  }

  renderAttachedFileChip(elements.attachedFilesContainer, kind, file, removeAttachedFile);
}

async function fetchAnalysisResult() {
  await fetchAnalysisResultService({
    analysisId,
    elements,
    updateNotice,
    updateAnalysisChatStatus,
    setButtonDisabled,
    onComplete: (scores) => {
      setButtonDisabled(elements.practiceModeButton, false);
      latestAnalysisScores = scores;
    },
  });
}

async function pollAnalysisStatus() {
  pollingTimer = await pollAnalysisStatusService({
    analysisId,
    pollingTimer,
    elements,
    updateAnalysisChatStatus,
    updateNotice,
    setButtonDisabled,
    fetchAnalysisResult,
  });
}

async function runAnalysis() {
  const result = await runAnalysisService({
    noteId,
    documentInput: elements.documentInput,
    audioInput: elements.audioInput,
    documentUploadId,
    audioUploadId,
    updateNotice,
    updateAnalysisChatStatus,
    setButtonDisabled,
    elements,
  });

  documentUploadId = result.documentUploadId;
  audioUploadId = result.audioUploadId;

  if (!result.success) {
    return false;
  }

  analysisId = result.analysisId;
  updateAnalysisChatStatus(result.statusText);

  if (pollingTimer) {
    window.clearInterval(pollingTimer);
  }

  pollingTimer = window.setInterval(pollAnalysisStatus, 2000);
  await pollAnalysisStatus();

  return true;
}

function initAnalysisPage() {
  renderEmptyResult(elements);
  renderDocumentPreview(elements.documentPreviewElement, null, null);
  initPanelResizers();

  initPracticeMode();
  setButtonDisabled(elements.practiceModeButton, true);
  elements.practiceModeButton?.addEventListener("click", () => {
    if (latestAnalysisScores) openPracticeModal(latestAnalysisScores);
  });

  bindInputListeners({
    documentInput: elements.documentInput,
    audioInput: elements.audioInput,
    filePicker: elements.filePicker,
    attachFileButton: elements.attachFileButton,
    runAnalysisButton: elements.runAnalysisButton,
    onRunAnalysis: async (attachments) => {
      const started = await runAnalysis();
      if (attachments.length > 0 && started) {
        clearSelectedFiles(
          elements.documentInput,
          elements.audioInput,
          elements.filePicker,
          renderAttachedFileChip,
          elements.attachedFilesContainer
        );
      }
    },
    onBack: () => {
      window.location.href = "./note.html";
    },
    onFileChanged,
    getSelectedAttachments: () => getSelectedAttachments(elements.documentInput, elements.audioInput),
    addMessageToChat,
    chatBodyElement: elements.chatBodyElement,
  });

  setupDragAndDrop(document.getElementById("chatDropzone"), elements.documentInput, elements.audioInput);

  if (!noteId) {
    setButtonDisabled(elements.runAnalysisButton, true);
    return;
  }

  updateNotice("노트 정보를 불러오는 중입니다.");
  resetAnalysisChatStatus();

  fetchNoteDetailService(noteId)
    .then((note) => {
      elements.noteTitleElement.textContent = note.title || "제목 없는 노트";
      elements.noteDescriptionElement.textContent = note.description || "설명이 없는 노트입니다.";
      updateNotice("노트 정보를 불러왔습니다. 문서와 음성 파일을 준비해주세요.");
    })
    .catch((error) => {
      console.error(error);
      setButtonDisabled(elements.runAnalysisButton, true);
    });
}

document.addEventListener("DOMContentLoaded", initAnalysisPage);
window.addEventListener("beforeunload", revokeDocumentPreviewUrl);
