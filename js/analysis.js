import {
  fetchNoteDetail as fetchNoteDetailService,
  fetchAnalysisResult as fetchAnalysisResultService,
  fetchLatestAnalysisResult as fetchLatestAnalysisResultService,
  pollAnalysisStatus as pollAnalysisStatusService,
  requestChatReply as requestChatReplyService,
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
import { API_BASE_URL, fetchJson } from "./analysis-upload.js";

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
  transcriptTextElement: document.getElementById("transcriptText"),
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
  chatDropzoneElement: document.getElementById("chatDropzone"),
  chatBodyElement: document.querySelector(".chat-body"),
};

let analysisStatusMessage = null;
let documentUploadId = null;
let audioUploadId = null;
let analysisId = null;
let pollingTimer = null;
let documentPreviewUrl = null;
let latestAnalysisScores = null;
let chatSessionId = null;
let isBusy = false;
let busyMode = null;
let chatAbortController = null;

async function saveChatMessageToServer(role, content) {
  if (!chatSessionId) return;
  try {
    await fetchJson(`${API_BASE_URL}/chat-sessions/${chatSessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
  } catch (err) {
    console.error("채팅 메시지 저장 실패:", err);
  }
}

function addMessageToChatAndPersist(chatBodyElement, text, isUser = false, attachments = []) {
  addMessageToChat(chatBodyElement, text, isUser, attachments);
  const role = isUser ? "user" : "assistant";
  const content = JSON.stringify({ text, attachments });
  saveChatMessageToServer(role, content);
}

async function initChatSession() {
  if (!noteId) return;
  try {
    const data = await fetchJson(`${API_BASE_URL}/notes/${noteId}/chat`);
    chatSessionId = data.session_id;
    data.messages.forEach(({ role, content }) => {
      let text = content;
      let attachments = [];
      try {
        const parsed = JSON.parse(content);
        text = parsed.text ?? content;
        attachments = parsed.attachments ?? [];
      } catch (_) {}
      addMessageToChat(elements.chatBodyElement, text, role === "user", attachments);
    });
  } catch (err) {
    console.error("채팅 세션 로드 실패:", err);
  }
}

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

function setRunButtonMode(mode = "send") {
  const button = elements.runAnalysisButton;
  if (!button) {
    return;
  }

  if (mode === "stop") {
    button.classList.add("is-stoppable");
    button.textContent = "";
    button.title = "중단";
    return;
  }

  button.classList.remove("is-stoppable");
  button.textContent = "↑";
  button.title = "전송";
}

function setBusyState(nextBusy, mode = null) {
  isBusy = nextBusy;
  busyMode = nextBusy ? mode : null;
  setRunButtonMode(nextBusy ? "stop" : "send");
}

function scrollChatInputIntoView() {
  const dropzone = elements.chatDropzoneElement;
  if (!dropzone) {
    return;
  }

  dropzone.scrollIntoView({ behavior: "smooth", block: "end" });
}

function getStageLabel(stage) {
  const labels = {
    queued: "큐에 등록",
    loading_model: "모델 로딩",
    transcribing: "음성 변환",
    postprocessing: "후처리",
    finished: "완료",
  };

  if (!stage) {
    return "분석 준비";
  }

  return labels[stage] || stage;
}

function getAnimatedDots(progress) {
  if (typeof progress !== "number" || Number.isNaN(progress)) {
    return "...";
  }
  const dotCount = ((Math.floor(progress / 10) % 3) + 1);
  return ".".repeat(dotCount);
}

function getAnalysisStatusText(stage, progress) {
  if (stage === "finished" || progress === 100) {
    return "모델 분석이 완료되었습니다. 결과를 확인해주세요.";
  }

  const stageLabel = getStageLabel(stage);
  const dots = getAnimatedDots(progress);
  const progressText = typeof progress === "number" ? `${Math.min(Math.max(progress, 0), 100)}%` : "진행률 계산 중";
  return `모델이 ${stageLabel} 중${dots} 현재 ${progressText} 진행 중입니다.`;
}

function updateAnalysisProgress(stage, progress, meta) {
  // meta: { icon, text, etaText, elapsedText, warningMsg } (선택)
  let statusText;
  if (meta && meta.text) {
    const pctText = `${Math.min(Math.max(progress, 0), 100)}%`;
    const parts = [`${meta.icon || "⚙️"} ${meta.text}`, pctText];
    if (meta.etaText) parts.push(meta.etaText);
    statusText = parts.join(" · ");
    if (meta.warningMsg) {
      statusText += `\n⚠️ ${meta.warningMsg}`;
    }
  } else {
    statusText = getAnalysisStatusText(stage, progress);
  }
  updateAnalysisChatStatus(statusText);
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
  scrollChatInputIntoView();
}

async function fetchAnalysisResult() {
  await fetchAnalysisResultService({
    analysisId,
    elements,
    updateNotice,
    updateAnalysisChatStatus,
    updateAnalysisProgress,
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
    updateAnalysisProgress,
    updateNotice,
    setButtonDisabled,
    fetchAnalysisResult,
  });

  if (!pollingTimer && busyMode === "analysis") {
    setBusyState(false);
  }
}

async function runAnalysis() {
  setBusyState(true, "analysis");
  try {
    const result = await runAnalysisService({
      noteId,
      documentInput: elements.documentInput,
      audioInput: elements.audioInput,
      documentUploadId,
      audioUploadId,
      updateNotice,
      updateAnalysisChatStatus,
      updateAnalysisProgress,
      setButtonDisabled,
      elements,
    });

    documentUploadId = result.documentUploadId;
    audioUploadId = result.audioUploadId;

    if (!result.success) {
      setBusyState(false);
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
  } catch (error) {
    console.error(error);
    updateNotice("분석 시작 중 오류가 발생했습니다.");
    setBusyState(false);
    return false;
  }
}

async function submitChatQuestion(message) {
  addMessageToChat(elements.chatBodyElement, message, true, []);
  setBusyState(true, "chat");
  chatAbortController = new AbortController();

  try {
    const reply = await requestChatReplyService(chatSessionId, message, chatAbortController.signal);
    addMessageToChat(elements.chatBodyElement, reply.answer, false, []);
  } catch (error) {
    if (error?.name === "AbortError") {
      addMessageToChat(
        elements.chatBodyElement,
        "응답 생성을 중단했습니다.",
        false,
        []
      );
      return;
    }
    console.error(error);
    addMessageToChat(
      elements.chatBodyElement,
      "답변을 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      false,
      []
    );
  } finally {
    chatAbortController = null;
    setBusyState(false);
  }
}

function stopCurrentTask() {
  if (!isBusy) {
    return;
  }

  if (busyMode === "analysis") {
    if (pollingTimer) {
      window.clearInterval(pollingTimer);
      pollingTimer = null;
    }
    updateAnalysisChatStatus("분석 요청을 중단했습니다. 다시 실행할 수 있습니다.");
    updateNotice("분석 상태 확인을 중단했습니다.");
    setButtonDisabled(elements.runAnalysisButton, false);
    setBusyState(false);
    return;
  }

  if (busyMode === "chat") {
    chatAbortController?.abort();
    setBusyState(false);
  }
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
    onTextSubmitted: submitChatQuestion,
    onStopRequested: stopCurrentTask,
    getIsBusy: () => isBusy,
    getSelectedAttachments: () => getSelectedAttachments(elements.documentInput, elements.audioInput),
    addMessageToChat: addMessageToChatAndPersist,
    chatBodyElement: elements.chatBodyElement,
  });

  setupDragAndDrop(document.getElementById("chatDropzone"), elements.documentInput, elements.audioInput);

  if (!noteId) {
    setButtonDisabled(elements.runAnalysisButton, true);
    return;
  }

  updateNotice("노트 정보를 불러오는 중입니다.");
  resetAnalysisChatStatus();
  setRunButtonMode("send");

  fetchNoteDetailService(noteId)
    .then((note) => {
      if (elements.noteTitleElement) {
        elements.noteTitleElement.textContent = note.title || "제목 없는 노트";
      }
      if (elements.noteDescriptionElement) {
        elements.noteDescriptionElement.textContent = note.description || "설명이 없는 노트입니다.";
      }
      updateNotice("노트 정보를 불러왔습니다. 문서와 음성 파일을 준비해주세요.");
    })
    .catch((error) => {
      console.error(error);
      updateNotice("노트 정보를 불러오는 데 실패했습니다.");
    });

  initChatSession();

  fetchLatestAnalysisResultService({
    noteId,
    elements,
    updateNotice,
    onComplete: (scores) => {
      setButtonDisabled(elements.practiceModeButton, false);
      latestAnalysisScores = scores;
    },
  });
}

document.addEventListener("DOMContentLoaded", initAnalysisPage);
window.addEventListener("beforeunload", revokeDocumentPreviewUrl);
