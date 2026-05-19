export function setNotice(element, message) {
  if (!element) {
    return;
  }

  element.textContent = message;
}

export function setButtonDisabled(button, disabled) {
  if (!button) {
    return;
  }

  button.disabled = disabled;
  button.style.opacity = disabled ? "0.6" : "1";
  button.style.pointerEvents = disabled ? "none" : "auto";
}

export function setElementText(element, text) {
  if (!element) {
    return;
  }

  element.textContent = text;
}

export function clearList(element, emptyMessage) {
  if (!element) {
    return;
  }

  element.innerHTML = "";

  if (emptyMessage) {
    const item = document.createElement("li");
    item.textContent = emptyMessage;
    element.appendChild(item);
  }
}

export function renderTextList(element, items, fallbackMessage) {
  if (!element) {
    return;
  }

  element.innerHTML = "";

  if (!items || items.length === 0) {
    const item = document.createElement("li");
    item.textContent = fallbackMessage;
    element.appendChild(item);
    return;
  }

  items.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    element.appendChild(item);
  });
}

export function renderTranscript(element, transcript) {
  if (!element) return;

  element.innerHTML = "";

  if (!transcript || !transcript.trim()) {
    const placeholder = document.createElement("p");
    placeholder.className = "transcript-placeholder";
    placeholder.textContent = "STT 변환 결과가 없습니다.";
    element.appendChild(placeholder);
    return;
  }

  const text = document.createElement("p");
  text.className = "transcript-body";
  text.textContent = transcript;
  element.appendChild(text);
}

function _fmtSec(sec) {
  if (sec == null || isNaN(sec)) return "?";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `0:${s.toString().padStart(2, "0")}`;
}

export function renderSections(element, sections, onSectionPlay, onTranscriptClick) {
  if (!element) return;

  element.innerHTML = "";

  if (!sections || sections.length === 0) {
    const msg = document.createElement("p");
    msg.className = "section-empty-msg";
    msg.textContent = "섹션 결과가 아직 없습니다.";
    element.appendChild(msg);
    return;
  }

  sections.forEach((section) => {
    const card = document.createElement("div");
    card.className = "section-card";

    // ── 헤더 ──
    const header = document.createElement("div");
    header.className = "section-card-header";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");

    const leftCol = document.createElement("div");
    leftCol.className = "section-card-left";

    const numBadge = document.createElement("span");
    numBadge.className = "section-num-badge";
    numBadge.textContent = String(section.section_index ?? "-");

    const titleEl = document.createElement("span");
    titleEl.className = "section-card-title";
    titleEl.textContent = section.title || "섹션";

    leftCol.append(numBadge, titleEl);

    const rightCol = document.createElement("div");
    rightCol.className = "section-card-right";

    const timeEl = document.createElement("span");
    timeEl.className = "section-card-time";
    timeEl.textContent = `${_fmtSec(section.start_time_sec)} – ${_fmtSec(section.end_time_sec)}`;

    const score = section.score ?? null;
    const scoreEl = document.createElement("span");
    const scoreClass = score === null ? "" : score >= 80 ? "good" : score >= 60 ? "fair" : "poor";
    scoreEl.className = `section-score-badge ${scoreClass}`.trim();
    scoreEl.textContent = score !== null ? String(score) : "-";

    const chevron = document.createElement("span");
    chevron.className = "section-chevron";
    chevron.textContent = "›";

    rightCol.append(timeEl, scoreEl, chevron);
    header.append(leftCol, rightCol);

    // ── 피드백 텍스트 (항상 표시) ──
    const feedbackEl = document.createElement("p");
    feedbackEl.className = "section-card-feedback";
    feedbackEl.textContent = section.feedback || "";

    // ── 플레이어 패널 (접기/펼치기) ──
    const playerArea = document.createElement("div");
    playerArea.className = "section-player-area";

    let isOpen = false;

    const toggle = () => {
      if (isOpen) {
        isOpen = false;
        playerArea.classList.remove("is-open");
        header.classList.remove("is-active");
      } else {
        element.querySelectorAll(".section-player-area.is-open").forEach((p) => {
          p.classList.remove("is-open");
        });
        element.querySelectorAll(".section-card-header.is-active").forEach((h) => {
          h.classList.remove("is-active");
        });
        isOpen = true;
        playerArea.classList.add("is-open");
        header.classList.add("is-active");
        if (onSectionPlay) onSectionPlay(section, playerArea);
        if (section.transcript) {
          const transcriptEl = playerArea.querySelector(".section-slide-transcript");
          if (!transcriptEl) {
            const t = document.createElement("p");
            t.className = "section-slide-transcript";
            t.textContent = section.transcript;
            if (onTranscriptClick) {
              t.classList.add("is-clickable");
              t.title = `슬라이드 ${section.section_index}로 이동`;
              t.addEventListener("click", () => onTranscriptClick(section.section_index));
            }
            playerArea.appendChild(t);
          }
        }
      }
    };

    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });

    card.append(header, feedbackEl, playerArea);
    element.appendChild(card);
  });
}

function createFileChip(kind, file) {
  const chip = document.createElement("div");
  chip.className = "attached-file-chip";
  chip.dataset.kind = kind;

  const label = document.createElement("span");
  label.textContent = kind === "audio" ? `음성: ${file.name}` : `문서: ${file.name}`;
  chip.appendChild(label);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "×";
  chip.appendChild(removeButton);

  return chip;
}

export function renderAttachedFileChip(container, kind, file, removeCallback) {
  if (!container) {
    return;
  }

  const existingChip = container.querySelector(`[data-kind="${kind}"]`);
  if (existingChip) {
    existingChip.remove();
  }

  if (!file) {
    return;
  }

  const chip = createFileChip(kind, file);
  chip.querySelector("button").addEventListener("click", () => removeCallback(kind));
  container.appendChild(chip);
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "크기 정보 없음";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const digits = value >= 10 || index === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}

export function renderDocumentPreview(container, file, previewUrl) {
  if (!container) {
    return;
  }

  if (!file) {
    container.className = "document-preview-empty";
    container.innerHTML = `
      <p class="document-preview-title">문서를 업로드하면 이곳에 미리보기가 표시됩니다.</p>
      <p class="document-preview-subtext">PDF는 바로 볼 수 있고, PPT/PPTX는 파일 정보를 확인할 수 있습니다.</p>
    `;
    return;
  }

  const lowerName = file.name.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf") || file.type === "application/pdf";

  if (isPdf && previewUrl) {
    container.className = "document-preview-panel pdf-preview";
    container.innerHTML = "";

    // Reset PDF.js state
    _pdfDoc = null;
    _pdfCanvas = null;
    _pdfPageInfoEl = null;
    _pdfCurrentPage = 1;
    _pdfRendering = false;
    _pdfRenderQueued = null;

    const navBar = document.createElement("div");
    navBar.className = "pdf-nav-bar";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "pdf-nav-btn";
    prevBtn.textContent = "‹";
    prevBtn.title = "이전 슬라이드";

    const pageInfo = document.createElement("span");
    pageInfo.className = "pdf-page-info";
    pageInfo.textContent = "로딩 중...";
    _pdfPageInfoEl = pageInfo;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "pdf-nav-btn";
    nextBtn.textContent = "›";
    nextBtn.title = "다음 슬라이드";

    navBar.append(prevBtn, pageInfo, nextBtn);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "pdf-canvas-wrap";

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-canvas";
    canvasWrap.appendChild(canvas);
    _pdfCanvas = canvas;

    container.append(navBar, canvasWrap);

    prevBtn.addEventListener("click", () => {
      if (_pdfDoc && _pdfCurrentPage > 1) _renderPdfPage(_pdfCurrentPage - 1);
    });
    nextBtn.addEventListener("click", () => {
      if (_pdfDoc && _pdfCurrentPage < _pdfDoc.numPages) _renderPdfPage(_pdfCurrentPage + 1);
    });

    const lib = window.pdfjsLib;
    if (lib) {
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      lib.getDocument(previewUrl).promise
        .then((doc) => {
          _pdfDoc = doc;
          pageInfo.textContent = `1 / ${doc.numPages}`;
          return _renderPdfPage(1);
        })
        .catch((err) => {
          console.error("PDF.js 로드 실패:", err);
          pageInfo.textContent = "로드 실패";
        });
    } else {
      // pdfjsLib not loaded — fallback to iframe
      container.innerHTML = "";
      const frame = document.createElement("iframe");
      frame.className = "document-preview-frame";
      frame.src = previewUrl;
      frame.title = `${file.name} 미리보기`;
      container.appendChild(frame);
    }
    return;
  }

  container.className = "document-preview-card";
  container.innerHTML = "";

  const badge = document.createElement("span");
  badge.className = "document-preview-badge";
  badge.textContent = lowerName.endsWith(".pptx") ? "PPTX FILE" : "PPT FILE";

  const meta = document.createElement("div");
  meta.className = "document-preview-meta";

  const fileName = document.createElement("p");
  fileName.className = "document-preview-filename";
  fileName.textContent = file.name;

  const info = document.createElement("p");
  info.className = "document-preview-info";
  info.textContent = `브라우저에서 PPT/PPTX 슬라이드를 직접 렌더링할 수 없어 파일 정보만 먼저 표시합니다. 크기: ${formatFileSize(file.size)}`;

  const subtext = document.createElement("p");
  subtext.className = "document-preview-subtext";
  subtext.textContent = "분석은 그대로 진행되며, 이후 서버 썸네일이나 슬라이드 이미지 API가 연결되면 실제 페이지 미리보기로 확장할 수 있습니다.";

  meta.append(fileName, info, subtext);
  container.append(badge, meta);
}

export function addMessageToChat(chatBodyElement, text, isUser = false, attachments = []) {
  if (!chatBodyElement || (!text.trim() && attachments.length === 0)) {
    return;
  }

  const message = document.createElement("div");
  message.className = `chat-message${isUser ? " user" : ""}`;

  if (text.trim()) {
    const contentLine = document.createElement("div");
    contentLine.textContent = text;
    message.appendChild(contentLine);
  }

  if (attachments.length > 0) {
    const attachmentBlock = document.createElement("div");
    attachmentBlock.className = "attachment-preview";

    const title = document.createElement("div");
    title.textContent = "첨부 파일";
    attachmentBlock.appendChild(title);

    attachments.forEach((attachment) => {
      const item = document.createElement("div");
      item.className = "attachment-item";
      item.textContent = `${attachment.label}: ${attachment.name}`;
      attachmentBlock.appendChild(item);
    });

    message.appendChild(attachmentBlock);
  }

  chatBodyElement.appendChild(message);
  chatBodyElement.scrollTop = chatBodyElement.scrollHeight;
}

export function createAnalysisProgressBubble(chatBodyElement) {
  if (!chatBodyElement) return null;

  const bubble = document.createElement("div");
  bubble.className = "analysis-progress-bubble";

  const header = document.createElement("div");
  header.className = "analysis-progress-header";

  const dots = document.createElement("div");
  dots.className = "analysis-progress-dots";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "analysis-progress-dot";
    dots.appendChild(dot);
  }

  const stage = document.createElement("span");
  stage.className = "analysis-progress-stage";
  stage.textContent = "분석 준비 중...";
  header.append(dots, stage);

  const track = document.createElement("div");
  track.className = "analysis-progress-bar-track";
  const fill = document.createElement("div");
  fill.className = "analysis-progress-bar-fill";
  fill.style.width = "0%";
  track.appendChild(fill);

  const footer = document.createElement("div");
  footer.className = "analysis-progress-footer";
  const pct = document.createElement("span");
  pct.textContent = "0%";
  footer.appendChild(pct);

  bubble.append(header, track, footer);
  chatBodyElement.appendChild(bubble);
  chatBodyElement.scrollTop = chatBodyElement.scrollHeight;

  return bubble;
}

export function updateAnalysisProgressBubble(bubble, stageLabel, progress) {
  if (!bubble) return;

  const stage = bubble.querySelector(".analysis-progress-stage");
  const fill = bubble.querySelector(".analysis-progress-bar-fill");
  const pct = bubble.querySelector(".analysis-progress-footer span");

  const safeProgress = typeof progress === "number" ? Math.min(Math.max(progress, 0), 100) : 0;
  if (stage) stage.textContent = `${stageLabel}...`;
  if (fill) fill.style.width = `${safeProgress}%`;
  if (pct) pct.textContent = `${safeProgress}%`;

  const parent = bubble.parentElement;
  if (parent) parent.scrollTop = parent.scrollHeight;
}

export function finishAnalysisProgressBubble(bubble) {
  if (!bubble) return null;

  const stage = bubble.querySelector(".analysis-progress-stage");
  const fill = bubble.querySelector(".analysis-progress-bar-fill");
  const pct = bubble.querySelector(".analysis-progress-footer span");

  if (stage) stage.textContent = "분석 완료!";
  if (fill) fill.style.width = "100%";
  if (pct) pct.textContent = "100%";
  bubble.classList.add("is-done");

  setTimeout(() => bubble.remove(), 1400);
  return null;
}

export function removeAnalysisProgressBubble(bubble) {
  if (bubble) bubble.remove();
  return null;
}

export function updateAnalysisStatusMessage(chatBodyElement, text, analysisStatusMessage) {
  if (!chatBodyElement) {
    return analysisStatusMessage;
  }

  if (!analysisStatusMessage) {
    analysisStatusMessage = document.createElement("div");
    analysisStatusMessage.className = "chat-message bot status-message";
    analysisStatusMessage.textContent = text;
    chatBodyElement.appendChild(analysisStatusMessage);
  } else {
    analysisStatusMessage.textContent = text;
  }

  chatBodyElement.scrollTop = chatBodyElement.scrollHeight;
  return analysisStatusMessage;
}

export function clearAnalysisStatusMessage(analysisStatusMessage) {
  if (analysisStatusMessage) {
    analysisStatusMessage.remove();
  }
  return null;
}

export function addQuickReplies(chatBodyElement, chips, onClick) {
  if (!chatBodyElement || !chips.length) return;
  const row = document.createElement("div");
  row.className = "quick-reply-row";
  chips.forEach((text) => {
    const btn = document.createElement("button");
    btn.className = "quick-reply-chip";
    btn.textContent = text;
    btn.addEventListener("click", () => {
      row.remove();
      onClick(text);
    });
    row.appendChild(btn);
  });
  chatBodyElement.appendChild(row);
  chatBodyElement.scrollTop = chatBodyElement.scrollHeight;
  return row;
}

export function getSelectedAttachments(documentInput, audioInput) {
  const attachments = [];
  const documentFile = documentInput?.files?.[0];
  const audioFile = audioInput?.files?.[0];

  if (documentFile) {
    attachments.push({ label: "문서", name: documentFile.name });
  }
  if (audioFile) {
    attachments.push({ label: "음성", name: audioFile.name });
  }

  return attachments;
}

export function clearSelectedFiles(documentInput, audioInput, filePicker, renderAttachedFileChip, attachedFilesContainer) {
  if (documentInput) {
    documentInput.value = "";
    renderAttachedFileChip(attachedFilesContainer, "document", null, () => {});
  }

  if (audioInput) {
    audioInput.value = "";
    renderAttachedFileChip(attachedFilesContainer, "audio", null, () => {});
  }

  if (filePicker) {
    filePicker.value = "";
  }
}

// ── PDF.js viewer state ──────────────────────────────────────────
let _pdfDoc = null;
let _pdfCanvas = null;
let _pdfPageInfoEl = null;
let _pdfCurrentPage = 1;
let _pdfRendering = false;
let _pdfRenderQueued = null;

async function _renderPdfPage(pageNum) {
  if (!_pdfDoc || !_pdfCanvas) return;

  if (_pdfRendering) {
    _pdfRenderQueued = pageNum;
    return;
  }

  _pdfRendering = true;
  _pdfCurrentPage = pageNum;

  try {
    const page = await _pdfDoc.getPage(pageNum);
    const canvasWrap = _pdfCanvas.parentElement;
    const containerWidth = (canvasWrap?.clientWidth) || 560;
    const baseVp = page.getViewport({ scale: 1 });
    const scale = containerWidth / baseVp.width;
    const viewport = page.getViewport({ scale });

    _pdfCanvas.width = viewport.width;
    _pdfCanvas.height = viewport.height;

    const ctx = _pdfCanvas.getContext("2d");
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;

    if (_pdfPageInfoEl) {
      _pdfPageInfoEl.textContent = `${_pdfCurrentPage} / ${_pdfDoc.numPages}`;
    }
  } catch (err) {
    if (err?.name !== "RenderingCancelledException") {
      console.error("PDF render error:", err);
    }
  }

  _pdfRendering = false;

  if (_pdfRenderQueued !== null) {
    const next = _pdfRenderQueued;
    _pdfRenderQueued = null;
    _renderPdfPage(next);
  }
}

export async function navigatePdfToPage(pageNum) {
  if (!_pdfDoc) return;
  const clamped = Math.max(1, Math.min(Math.round(pageNum), _pdfDoc.numPages));
  await _renderPdfPage(clamped);
}

let _historyChart = null;

/**
 * 분석 히스토리 꺾은선 그래프를 렌더링한다.
 * selectedIndex: 현재 선택된 분석 인덱스 (굵은 포인트로 강조)
 * onPointClick(index, analysisId): 포인트 클릭 콜백
 */
export function renderHistoryChart(canvasEl, emptyEl, history, selectedIndex, onPointClick) {
  if (_historyChart) {
    _historyChart.destroy();
    _historyChart = null;
  }

  if (!history || history.length === 0) {
    if (canvasEl) canvasEl.hidden = true;
    if (emptyEl) emptyEl.style.display = "flex";
    return;
  }

  if (canvasEl) canvasEl.hidden = false;
  if (emptyEl) emptyEl.style.display = "none";

  const labels = history.map(h => h.label);

  function makeDataset(key, color) {
    return {
      data: history.map(h => h.scores[key]),
      borderColor: color,
      backgroundColor: color.replace(")", ", 0.1)").replace("rgb", "rgba"),
      tension: 0.35,
      pointRadius: history.map((_, i) => i === selectedIndex ? 7 : 4),
      pointHoverRadius: 7,
      pointBackgroundColor: history.map((_, i) => i === selectedIndex ? color : "#fff"),
      pointBorderColor: color,
      pointBorderWidth: 2,
    };
  }

  _historyChart = new window.Chart(canvasEl, {
    type: "line",
    data: {
      labels,
      datasets: [
        { ...makeDataset("content_coverage_user", "rgb(79,149,255)"), label: "내용 전달력" },
        { ...makeDataset("delivery_stability", "rgb(52,200,138)"), label: "전달 안정성" },
        { ...makeDataset("pacing_score", "rgb(255,159,67)"), label: "발표 속도" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => history[items[0].dataIndex].label,
            afterBody: () => ["클릭하면 해당 분석 보기"],
          },
        },
      },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { stepSize: 25, font: { size: 10 }, color: "#8a9ab0" },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        x: {
          ticks: { font: { size: 10 }, color: "#8a9ab0" },
          grid: { display: false },
        },
      },
      onClick: (_e, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          onPointClick(idx, history[idx].analysis_id);
        }
      },
    },
  });
}

export function renderEmptyResult(elements) {
  setElementText(elements.contentCoverageElement, "- ");
  setElementText(elements.deliveryStabilityElement, "- ");
  setElementText(elements.pacingScoreElement, "- ");
  setElementText(elements.summaryElement, "분석 결과가 아직 없습니다.");
  clearList(elements.strengthsListElement, "강점 데이터가 아직 없습니다.");
  clearList(elements.improvementsListElement, "개선점 데이터가 아직 없습니다.");
  renderSections(elements.sectionsListElement, [], null);
}

/**
 * 내용 전달력 점수를 reliability 신호등에 따라 렌더링한다.
 *
 * - high  : 점수 그대로 표시
 * - medium: 점수 + "참고용" 배지
 * - low   : 점수 숨김 (취소선) + note 문구 표시
 */
export function renderContentCoverage(scoreElement, badgeElement, noteElement, rowElement, score, reliability) {
  const level = reliability?.alignment_level ?? "high";
  const shown = reliability?.content_coverage_shown ?? true;

  // 점수 표시 / 숨김
  if (rowElement) {
    rowElement.classList.toggle("reliability-low", level === "low" || !shown);
  }
  if (scoreElement) {
    scoreElement.textContent = score !== null && score !== undefined ? String(score) : "-";
  }

  // 배지 (medium만 표시)
  if (badgeElement) {
    if (level === "medium") {
      badgeElement.textContent = "참고용";
      badgeElement.className = "reliability-badge medium";
      badgeElement.hidden = false;
    } else {
      badgeElement.hidden = true;
    }
  }

  // note 문구 (low / medium)
  if (noteElement) {
    const noteText = reliability?.note ?? "";
    if (noteText && (level === "low" || level === "medium")) {
      noteElement.textContent = noteText;
      noteElement.hidden = false;
    } else {
      noteElement.hidden = true;
    }
  }
}
