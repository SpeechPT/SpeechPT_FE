import {
  fetchNoteDetail as fetchNoteDetailService,
  fetchAnalysisResult as fetchAnalysisResultService,
  fetchLatestAnalysisResult as fetchLatestAnalysisResultService,
  fetchAnalysisHistory as fetchAnalysisHistoryService,
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
  addQuickReplies,
  updateAnalysisStatusMessage,
  clearAnalysisStatusMessage,
  getSelectedAttachments,
  clearSelectedFiles,
  renderEmptyResult,
  renderHistoryChart,
  createAnalysisProgressBubble,
  updateAnalysisProgressBubble,
  finishAnalysisProgressBubble,
  removeAnalysisProgressBubble,
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
  historyChartElement: document.getElementById("historyChart"),
  historyChartEmptyElement: document.getElementById("historyChartEmpty"),
  contentCoverageElement: document.getElementById("contentCoverageScore"),
  contentCoverageRowElement: document.getElementById("contentCoverageRow"),
  reliabilityBadgeElement: document.getElementById("reliabilityBadge"),
  reliabilityNoteElement: document.getElementById("reliabilityNote"),
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
let analysisProgressBubble = null;
let documentUploadId = null;
let sectionAudio = null;
let sectionAudioBlobUrl = null;
let audioUploadId = null;
let analysisId = null;
let pollingTimer = null;
let documentPreviewUrl = null;
let latestAnalysisScores = null;
let chatSessionId = null;
let isBusy = false;
let busyMode = null;
let chatAbortController = null;
let analysisHistory = [];
let selectedHistoryIndex = null;
let hasAnalysisResult = false;
let postAnalysisChipsShown = false;

const PRE_ANALYSIS_CHIPS = ["SpeechPT가 뭘 분석해주나요?", "어떤 파일을 업로드해야 하나요?"];
const PRE_ANALYSIS_FIXED = {
  "SpeechPT가 뭘 분석해주나요?":
    "SpeechPT는 발표 문서(PDF·PPT)와 음성 파일을 함께 분석해 3가지 핵심 지표를 제공합니다.\n\n• 내용 전달력: 슬라이드 내용을 얼마나 말로 전달했는지\n• 전달 안정성: 음성이 흔들림 없이 안정적으로 전달됐는지\n• 발표 속도: WPM 기반 적절한 발표 속도인지",
  "어떤 파일을 업로드해야 하나요?":
    "두 가지 파일이 필요해요!\n\n• 발표 문서: PDF, PPT, PPTX 형식\n• 발표 음성: MP3, WAV, M4A 형식\n\n채팅창 하단 📎 버튼을 누르거나 파일을 드래그&드롭 해보세요.",
};
const POST_ANALYSIS_CHIPS = [
  "가장 개선이 필요한 부분은?",
  "전달 안정성을 높이려면?",
  "발표 속도 조절 방법",
  "슬라이드별 상세 피드백",
];

function showWelcomeChatMessage() {
  const chat = elements.chatBodyElement;
  if (!chat) return;
  addMessageToChat(
    chat,
    "안녕하세요! SpeechPT 분석 도우미입니다.\n발표 문서(PDF·PPT)와 음성 파일을 업로드하면 내용 전달력, 전달 안정성, 발표 속도를 분석해드립니다.\n\n아래 질문을 눌러보거나, 파일을 업로드하고 분석을 시작해보세요!",
    false,
    []
  );
  addQuickReplies(chat, PRE_ANALYSIS_CHIPS, handlePreAnalysisChipClick);
}

function handlePreAnalysisChipClick(text) {
  const chat = elements.chatBodyElement;
  addMessageToChat(chat, text, true, []);
  const answer = PRE_ANALYSIS_FIXED[text] ?? "분석을 먼저 완료하면 더 자세히 답변해드릴 수 있어요!";
  addMessageToChat(chat, answer, false, []);
  addQuickReplies(chat, PRE_ANALYSIS_CHIPS, handlePreAnalysisChipClick);
}

function showPostAnalysisChips() {
  if (postAnalysisChipsShown || !elements.chatBodyElement) return;
  postAnalysisChipsShown = true;
  addMessageToChat(elements.chatBodyElement, "분석 결과에 대해 궁금한 점을 질문해보세요!", false, []);
  addQuickReplies(elements.chatBodyElement, POST_ANALYSIS_CHIPS, (text) => submitChatQuestion(text));
}

function showWelcomeModal() {
  const backdrop = document.getElementById("welcomeModalBackdrop");
  if (!backdrop) return;
  backdrop.classList.add("active");

  const docZone = document.getElementById("welcomeDocZone");
  const audioZone = document.getElementById("welcomeAudioZone");
  const docNameEl = document.getElementById("welcomeDocName");
  const audioNameEl = document.getElementById("welcomeAudioName");
  const startBtn = document.getElementById("welcomeStartBtn");

  function updateStartBtn() {
    const hasDoc = Boolean(elements.documentInput?.files?.[0]);
    const hasAudio = Boolean(elements.audioInput?.files?.[0]);
    if (startBtn) startBtn.disabled = !(hasDoc && hasAudio);
  }

  function onDocChange() {
    const file = elements.documentInput?.files?.[0];
    if (docNameEl) docNameEl.textContent = file ? file.name : "";
    docZone?.classList.toggle("has-file", Boolean(file));
    updateStartBtn();
  }

  function onAudioChange() {
    const file = elements.audioInput?.files?.[0];
    if (audioNameEl) audioNameEl.textContent = file ? file.name : "";
    audioZone?.classList.toggle("has-file", Boolean(file));
    updateStartBtn();
  }

  docZone?.addEventListener("click", () => elements.documentInput?.click());
  audioZone?.addEventListener("click", () => elements.audioInput?.click());
  elements.documentInput?.addEventListener("change", onDocChange);
  elements.audioInput?.addEventListener("change", onAudioChange);

  function closeModal() {
    backdrop.classList.remove("active");
  }

  document.getElementById("closeWelcomeModal")?.addEventListener("click", closeModal);
  document.getElementById("welcomeSkipBtn")?.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });

  startBtn?.addEventListener("click", async () => {
    closeModal();
    await runAnalysis();
  });

  showWelcomeChatMessage();
}

async function loadHistoryChart(autoSelectLatest = false) {
  analysisHistory = await fetchAnalysisHistoryService(noteId);
  if (autoSelectLatest && analysisHistory.length > 0) {
    selectedHistoryIndex = analysisHistory.length - 1;
  }
  renderHistoryChart(
    elements.historyChartElement,
    elements.historyChartEmptyElement,
    analysisHistory,
    selectedHistoryIndex,
    onHistoryPointClick,
  );
}

async function onHistoryPointClick(index, clickedAnalysisId) {
  selectedHistoryIndex = index;
  renderHistoryChart(
    elements.historyChartElement,
    elements.historyChartEmptyElement,
    analysisHistory,
    selectedHistoryIndex,
    onHistoryPointClick,
  );
  await fetchAnalysisResultService({
    analysisId: clickedAnalysisId,
    elements,
    updateNotice,
    updateAnalysisChatStatus,
    updateAnalysisProgress: null,
    setButtonDisabled,
    onSectionPlay: playSectionInPanel,
    onComplete: (scores) => { latestAnalysisScores = scores; },
  });
}

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

function revokeSectionAudio() {
  if (sectionAudio) {
    sectionAudio.pause();
  }
  if (sectionAudioBlobUrl) {
    URL.revokeObjectURL(sectionAudioBlobUrl);
    sectionAudioBlobUrl = null;
  }
}

function _fmtTime(sec) {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function playSectionInPanel(section, playerEl) {
  playerEl.innerHTML = "";

  const file = elements.audioInput?.files?.[0];
  if (!file) {
    const msg = document.createElement("p");
    msg.className = "section-player-no-audio";
    msg.textContent = "재생하려면 음성 파일을 다시 업로드해주세요.";
    playerEl.appendChild(msg);
    return;
  }

  if (!sectionAudio) {
    sectionAudio = new Audio();
  }
  if (!sectionAudioBlobUrl) {
    sectionAudioBlobUrl = URL.createObjectURL(file);
    sectionAudio.src = sectionAudioBlobUrl;
  }
  sectionAudio.pause();

  const startTime = section.start_time_sec ?? 0;
  const endTime = section.end_time_sec ?? startTime;
  const duration = Math.max(0, endTime - startTime);

  const controls = document.createElement("div");
  controls.className = "section-player-controls";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "section-play-btn";
  playBtn.textContent = "▶";

  const trackWrap = document.createElement("div");
  trackWrap.className = "section-player-track-wrap";

  const progress = document.createElement("input");
  progress.type = "range";
  progress.className = "section-player-progress";
  progress.min = "0";
  progress.max = "100";
  progress.value = "0";
  progress.step = "0.1";

  const timeLabel = document.createElement("span");
  timeLabel.className = "section-player-time";
  timeLabel.textContent = `0:00 / ${_fmtTime(duration)}`;

  trackWrap.appendChild(progress);
  controls.append(playBtn, trackWrap, timeLabel);

  const feedbackEl = document.createElement("p");
  feedbackEl.className = "section-feedback-text";
  feedbackEl.textContent = section.feedback || "";

  playerEl.append(controls, feedbackEl);

  let isPlaying = false;
  let timeupdateHandler = null;

  function stopPlayback() {
    sectionAudio.pause();
    isPlaying = false;
    playBtn.textContent = "▶";
    if (timeupdateHandler) {
      sectionAudio.removeEventListener("timeupdate", timeupdateHandler);
      timeupdateHandler = null;
    }
  }

  timeupdateHandler = () => {
    const pos = Math.max(0, sectionAudio.currentTime - startTime);
    const pct = duration > 0 ? Math.min((pos / duration) * 100, 100) : 0;
    progress.value = String(pct);
    timeLabel.textContent = `${_fmtTime(pos)} / ${_fmtTime(duration)}`;
    if (sectionAudio.currentTime >= endTime) {
      stopPlayback();
    }
  };

  playBtn.addEventListener("click", () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      if (sectionAudio.currentTime < startTime || sectionAudio.currentTime >= endTime) {
        sectionAudio.currentTime = startTime;
      }
      sectionAudio.addEventListener("timeupdate", timeupdateHandler);
      sectionAudio.play();
      isPlaying = true;
      playBtn.textContent = "⏸";
    }
  });

  progress.addEventListener("input", () => {
    sectionAudio.currentTime = startTime + (Number(progress.value) / 100) * duration;
  });

  sectionAudio.currentTime = startTime;
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

function updateAnalysisProgress(stage, progress) {
  if (stage === "finished" || progress >= 100) {
    analysisProgressBubble = finishAnalysisProgressBubble(analysisProgressBubble);
    return;
  }

  if (!analysisProgressBubble) {
    analysisProgressBubble = createAnalysisProgressBubble(elements.chatBodyElement);
  }
  updateAnalysisProgressBubble(analysisProgressBubble, getStageLabel(stage), progress);
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
  analysisProgressBubble = removeAnalysisProgressBubble(analysisProgressBubble);
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
    revokeSectionAudio();
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
    onSectionPlay: playSectionInPanel,
    onComplete: (scores) => {
      setButtonDisabled(elements.practiceModeButton, false);
      latestAnalysisScores = scores;
      hasAnalysisResult = true;
      loadHistoryChart(true);
      showPostAnalysisChips();
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

  // 분석 완료 전: 고정 응답 반환
  if (!hasAnalysisResult) {
    const answer = PRE_ANALYSIS_FIXED[message] ??
      "분석을 먼저 완료해야 자세한 답변이 가능해요. 파일을 업로드하고 분석을 실행해보세요!";
    addMessageToChat(elements.chatBodyElement, answer, false, []);
    addQuickReplies(elements.chatBodyElement, PRE_ANALYSIS_CHIPS, handlePreAnalysisChipClick);
    return;
  }

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
    onNoResult: showWelcomeModal,
    onSectionPlay: playSectionInPanel,
    onComplete: (scores) => {
      setButtonDisabled(elements.practiceModeButton, false);
      latestAnalysisScores = scores;
      hasAnalysisResult = true;
      showPostAnalysisChips();
    },
  });

  loadHistoryChart(true);
}

document.addEventListener("DOMContentLoaded", () => {
  initAnalysisPage();
  document.getElementById("logoHome")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
window.addEventListener("beforeunload", () => {
  revokeDocumentPreviewUrl();
  revokeSectionAudio();
});
