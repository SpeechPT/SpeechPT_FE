import { API_BASE_URL, fetchJson, uploadSelectedFiles } from "./analysis-upload.js";
import { renderEmptyResult, setElementText, renderTextList, renderSections, renderTranscript, renderDocumentPreview, renderContentCoverage } from "./analysis-render.js";
import { authFetch } from "./auth.js";

// ──────────────────────────────────────────────────────────────
// 분석 단계별 사용자 친화 라벨 (실측 데이터 기반)
//
// CloudWatch 로그 5건 분석 → 단계별 평균 시간 비율:
//   stt(26%) + llm(23%) + keypoint(22%) + ae_feature(14%)
//   + alignment(9%) + ae_probe(3%) + 기타(3%) = 100%
// 전체 평균 ~88초 (1분 28초)
// ──────────────────────────────────────────────────────────────
const STAGE_LABELS = {
  ingest:    { icon: "📥", text: "분석 요청 접수 중" },
  stt:       { icon: "🎤", text: "음성 인식(STT) 진행 중" },
  keypoint:  { icon: "📄", text: "슬라이드 키포인트 추출 중" },
  alignment: { icon: "🔗", text: "발화와 슬라이드 매칭 중" },
  ae_feature:{ icon: "📊", text: "음향 특징 분석 중" },
  ae_probe:  { icon: "🧠", text: "발화 태도 평가 중" },
  llm:       { icon: "🤖", text: "AI 종합 피드백 작성 중" },
  finalize:  { icon: "✨", text: "결과 정리 중" },
  finished:  { icon: "✅", text: "완료" },
  analyzing: { icon: "⚙️", text: "분석 중" },  // 구버전 호환
};

function getStageLabel(stage) {
  return STAGE_LABELS[stage] || { icon: "⚙️", text: "분석 중" };
}

// 평균 분석 시간(초). 실측 88초 + 마진.
const AVG_ANALYSIS_DURATION_SEC = 100;

// 폴링 상태 추적 (전역; 분석 1건씩만 동작하므로 충돌 없음)
const _progressState = {
  startTime: null,         // 분석 시작 시각 (Date.now() 기준)
  lastDisplayPct: 0,       // 마지막으로 화면에 보여준 % (역행 방지)
};

function _resetProgressState() {
  _progressState.startTime = Date.now();
  _progressState.lastDisplayPct = 0;
}

/**
 * 서버 progress와 시간 기반 progress를 합쳐 더 부드러운 값을 만든다.
 *
 * 원리:
 *  - 서버는 4초마다 progress를 업데이트하지만, 단계 사이에 뚝 끊긴 느낌이 남음
 *  - 시간 기반 선형 보간으로 진행률을 1초 단위로 부드럽게
 *  - 단, 서버 값보다 앞서가지 않도록 cap (사용자 거짓말 방지)
 *  - 역행은 절대 금지 (Math.max로 보장)
 */
function _smoothProgress(serverPct, elapsedSec) {
  // 서버가 85% 이상 (sm_invoke 완료) → 시간 보정 무시하고 서버 값 사용
  if (serverPct >= 85) {
    _progressState.lastDisplayPct = Math.max(_progressState.lastDisplayPct, serverPct);
    return _progressState.lastDisplayPct;
  }

  // 시간 기반 예상 진행률 (30% → 84%까지 평균 시간에 맞춰 선형 진행)
  let timeBasedPct;
  if (elapsedSec <= 0) {
    timeBasedPct = 30;
  } else if (elapsedSec >= AVG_ANALYSIS_DURATION_SEC) {
    // 평균 시간 초과: 84%에서 매우 천천히 (10초당 +0.3%)
    timeBasedPct = Math.min(89, 84 + (elapsedSec - AVG_ANALYSIS_DURATION_SEC) / 10 * 0.3);
  } else {
    timeBasedPct = 30 + (elapsedSec / AVG_ANALYSIS_DURATION_SEC) * 54;  // 30 → 84
  }

  // 서버 값과 시간 기반 값 중 큰 값, 단 역행 방지
  const target = Math.max(serverPct, timeBasedPct);
  const next = Math.max(_progressState.lastDisplayPct, target);
  _progressState.lastDisplayPct = next;
  return next;
}

/**
 * ETA 계산 (초 단위)
 */
function _computeETA(displayPct, elapsedSec) {
  if (displayPct >= 100) return 0;
  if (displayPct >= 85) return Math.max(2, AVG_ANALYSIS_DURATION_SEC * 0.05);

  // 남은 % / 현재 속도(%/s) 기반 단순 추정
  const remaining = (AVG_ANALYSIS_DURATION_SEC - elapsedSec);
  return Math.max(3, remaining);
}

function _formatETA(seconds) {
  if (seconds <= 0) return "곧 완료됩니다";
  if (seconds < 60) return `약 ${Math.ceil(seconds)}초 남음`;
  const min = Math.floor(seconds / 60);
  const sec = Math.ceil(seconds % 60);
  return sec === 0 ? `약 ${min}분 남음` : `약 ${min}분 ${sec}초 남음`;
}

function _formatElapsed(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}초`;
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}분 ${sec}초`;
}

/**
 * 외부 노출 — 통합 progress 디스플레이 데이터 생성
 */
export function buildProgressDisplay(statusData) {
  // 첫 호출 시 시작 시각 기록
  if (_progressState.startTime === null) {
    _resetProgressState();
  }

  const elapsedSec = (Date.now() - _progressState.startTime) / 1000;
  const serverPct = Number(statusData?.progress ?? 0);
  const displayPct = _smoothProgress(serverPct, elapsedSec);
  const stage = statusData?.stage ?? "analyzing";
  const stageInfo = getStageLabel(stage);
  const etaSec = _computeETA(displayPct, elapsedSec);

  // 평균 시간 초과 시 경고 메시지
  let warningMsg = null;
  if (elapsedSec > AVG_ANALYSIS_DURATION_SEC * 1.5 && serverPct < 85) {
    warningMsg = "평소보다 분석이 오래 걸리고 있어요. 발표가 길거나 서버가 바쁠 수 있습니다.";
  }

  // 완료 시 상태 reset
  if (statusData?.status === "done" || statusData?.status === "failed") {
    _progressState.startTime = null;
  }

  return {
    percent: Math.round(displayPct),
    serverPercent: serverPct,
    stageIcon: stageInfo.icon,
    stageText: stageInfo.text,
    stageKey: stage,
    elapsedText: _formatElapsed(elapsedSec),
    etaText: _formatETA(etaSec),
    warningMsg,
    isComplete: statusData?.status === "done",
    isFailed: statusData?.status === "failed",
  };
}

// 외부에서 명시적으로 분석 시작 시 호출 (예: runAnalysis 직후)
export function resetProgressTracking() {
  _resetProgressState();
}

export async function requestChatReply(sessionId, question, signal = null) {
  if (!sessionId) {
    throw new Error("채팅 세션이 초기화되지 않았습니다.");
  }

  return await fetchJson(`${API_BASE_URL}/chat-sessions/${sessionId}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      question,
    }),
  });
}

export async function fetchAnalysisHistory(noteId) {
  if (!noteId) return [];
  try {
    return await fetchJson(`${API_BASE_URL}/notes/${noteId}/analyses/history`);
  } catch (err) {
    console.error("분석 히스토리 로드 실패:", err);
    return [];
  }
}

export async function fetchNoteDetail(noteId) {
  if (!noteId) {
    throw new Error("note_id가 없습니다.");
  }

  return await fetchJson(`${API_BASE_URL}/notes/${noteId}`);
}

async function _restoreAudioForSections(uploadId) {
  if (!uploadId) return null;
  try {
    const response = await authFetch(`${API_BASE_URL}/uploads/${uploadId}/file`);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    let blob;
    if (contentType.includes("application/json")) {
      const json = await response.json();
      if (!json.preview_url) return null;
      const audioResponse = await fetch(json.preview_url);
      if (!audioResponse.ok) return null;
      blob = await audioResponse.blob();
    } else {
      blob = await response.blob();
    }
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("음성 파일 복원 실패:", err);
    return null;
  }
}

async function _restoreDocumentPreview(uploadId, filename, previewElement) {
  if (!uploadId || !previewElement) return;
  try {
    const response = await authFetch(`${API_BASE_URL}/uploads/${uploadId}/file`);
    if (!response.ok) return;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // S3: backend returns presigned URL as JSON — fetch as blob for PDF.js compatibility
      const json = await response.json();
      if (!json.preview_url) return;
      const fileInfo = {
        name: json.filename || filename || "document",
        type: json.content_type || "application/pdf",
        size: 0,
      };
      try {
        const pdfResponse = await fetch(json.preview_url);
        if (!pdfResponse.ok) throw new Error("fetch failed");
        const blob = await pdfResponse.blob();
        renderDocumentPreview(previewElement, fileInfo, URL.createObjectURL(blob));
      } catch (_) {
        // CORS fallback: pass presigned URL directly
        renderDocumentPreview(previewElement, fileInfo, json.preview_url);
      }
    } else {
      // Local: backend returns the file directly — create a blob URL
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const fileInfo = { name: filename || "document", type: blob.type, size: blob.size };
      renderDocumentPreview(previewElement, fileInfo, blobUrl);
    }
  } catch (err) {
    console.error("문서 미리보기 복원 실패:", err);
  }
}

export async function fetchLatestAnalysisResult({ noteId, elements, updateNotice, onComplete, onNoResult, onSectionPlay, onAudioRestored, onAudioLoadStart, onDocumentLoadStart, onTranscriptClick }) {
  if (!noteId) return;
  try {
    const result = await fetchJson(`${API_BASE_URL}/notes/${noteId}/analyses/latest/result`);
    if (!result.is_ready) {
      if (onNoResult) onNoResult();
      return;
    }

    renderTranscript(elements.transcriptTextElement, result.transcript ?? null);
    renderContentCoverage(
      elements.contentCoverageElement,
      elements.reliabilityBadgeElement,
      elements.reliabilityNoteElement,
      elements.contentCoverageRowElement,
      result.scores?.content_coverage_user ?? null,
      result.reliability ?? null,
    );
    setElementText(elements.deliveryStabilityElement, String(result.scores?.delivery_stability ?? "-"));
    setElementText(elements.pacingScoreElement, String(result.scores?.pacing_score ?? "-"));
    setElementText(elements.summaryElement, result.summary || "요약 데이터가 없습니다.");
    renderTextList(elements.strengthsListElement, result.strengths, "강점 데이터가 없습니다.");
    renderTextList(elements.improvementsListElement, result.improvements, "개선점 데이터가 없습니다.");
    renderSections(elements.sectionsListElement, result.sections, onSectionPlay, onTranscriptClick);
    updateNotice("이전 분석 결과를 불러왔습니다.");

    if (result.document_upload_id) {
      if (onDocumentLoadStart) onDocumentLoadStart();
      _restoreDocumentPreview(result.document_upload_id, result.document_filename, elements.documentPreviewElement);
    }

    if (result.audio_upload_id && onAudioRestored) {
      if (onAudioLoadStart) onAudioLoadStart();
      _restoreAudioForSections(result.audio_upload_id).then(blobUrl => {
        if (blobUrl) onAudioRestored(blobUrl);
        else if (onAudioLoadStart) onAudioLoadStart(false);
      });
    }

    if (onComplete) {
      onComplete({
        contentCoverage: result.scores?.content_coverage_user ?? null,
        deliveryStability: result.scores?.delivery_stability ?? null,
        pacingScore: result.scores?.pacing_score ?? null,
        reliability: result.reliability ?? null,
      });
    }
  } catch (err) {
    if (err.status === 404) {
      if (onNoResult) onNoResult();
      return;
    }
    console.error("이전 분석 결과 로드 실패:", err);
  }
}

export async function fetchAnalysisResult({ analysisId, elements, updateNotice, updateAnalysisChatStatus, updateAnalysisProgress, setButtonDisabled, onComplete, onSectionPlay, onAudioRestored, onAudioLoadStart, onDocumentLoadStart, onTranscriptClick }) {
  if (!analysisId) {
    return;
  }

  try {
    const result = await fetchJson(`${API_BASE_URL}/analyses/${analysisId}/result`);

    if (!result.is_ready) {
      renderEmptyResult(elements);
      updateNotice("분석 결과가 아직 준비되지 않았습니다.");
      return;
    }

    renderTranscript(elements.transcriptTextElement, result.transcript ?? null);
    renderContentCoverage(
      elements.contentCoverageElement,
      elements.reliabilityBadgeElement,
      elements.reliabilityNoteElement,
      elements.contentCoverageRowElement,
      result.scores?.content_coverage_user ?? null,
      result.reliability ?? null,
    );
    setElementText(elements.deliveryStabilityElement, String(result.scores?.delivery_stability ?? "-"));
    setElementText(elements.pacingScoreElement, String(result.scores?.pacing_score ?? "-"));
    setElementText(elements.summaryElement, result.summary || "요약 데이터가 없습니다.");
    renderTextList(elements.strengthsListElement, result.strengths, "강점 데이터가 없습니다.");
    renderTextList(elements.improvementsListElement, result.improvements, "개선점 데이터가 없습니다.");
    renderSections(elements.sectionsListElement, result.sections, onSectionPlay, onTranscriptClick);
    if (updateAnalysisProgress) {
      updateAnalysisProgress(result.stage ?? "완료", 100);
    }
    updateAnalysisChatStatus("분석이 완료되었습니다. 결과를 확인하세요.");
    updateNotice("분석 결과를 불러왔습니다.");

    if (result.document_upload_id) {
      if (onDocumentLoadStart) onDocumentLoadStart();
      _restoreDocumentPreview(result.document_upload_id, result.document_filename, elements.documentPreviewElement);
    }

    if (result.audio_upload_id && onAudioRestored) {
      if (onAudioLoadStart) onAudioLoadStart();
      _restoreAudioForSections(result.audio_upload_id).then(blobUrl => {
        if (blobUrl) onAudioRestored(blobUrl);
        else if (onAudioLoadStart) onAudioLoadStart(false);
      });
    }

    if (onComplete) {
      onComplete({
        contentCoverage: result.scores?.content_coverage_user ?? null,
        deliveryStability: result.scores?.delivery_stability ?? null,
        pacingScore: result.scores?.pacing_score ?? null,
        reliability: result.reliability ?? null,
      });
    }
  } catch (error) {
    console.error(error);
    updateNotice("분석 결과를 불러오는 중 오류가 발생했습니다.");
    setButtonDisabled(elements.runAnalysisButton, false);
  }
}

export async function pollAnalysisStatus({ analysisId, pollingTimer, elements, updateAnalysisChatStatus, updateAnalysisProgress, updateNotice, setButtonDisabled, fetchAnalysisResult }) {
  if (!analysisId) {
    return pollingTimer;
  }

  try {
    const statusData = await fetchJson(`${API_BASE_URL}/analyses/${analysisId}/status`);
    const display = buildProgressDisplay(statusData);

    if (updateAnalysisProgress) {
      // updateAnalysisProgress(stageKey, percent, displayMeta) 시그너처
      updateAnalysisProgress(display.stageKey, display.percent, {
        icon: display.stageIcon,
        text: display.stageText,
        etaText: display.etaText,
        elapsedText: display.elapsedText,
        warningMsg: display.warningMsg,
      });
    } else {
      const msg = display.warningMsg
        ? `${display.stageIcon} ${display.stageText} · ${display.percent}% · ${display.etaText} (${display.warningMsg})`
        : `${display.stageIcon} ${display.stageText} · ${display.percent}% · ${display.etaText}`;
      updateAnalysisChatStatus(msg);
    }

    if (display.isComplete) {
      window.clearInterval(pollingTimer);
      pollingTimer = null;
      await fetchAnalysisResult();
      if (updateAnalysisProgress) {
        updateAnalysisProgress("finished", 100, {
          icon: "✅", text: "완료", etaText: "", elapsedText: "", warningMsg: null,
        });
      }
      setButtonDisabled(elements.runAnalysisButton, false);
      return pollingTimer;
    }

    if (display.isFailed) {
      window.clearInterval(pollingTimer);
      pollingTimer = null;
      updateAnalysisChatStatus("분석이 실패했습니다. 다시 시도해주세요.");
      updateNotice("분석이 실패했습니다.");
      setButtonDisabled(elements.runAnalysisButton, false);
    }
  } catch (error) {
    console.error(error);
    window.clearInterval(pollingTimer);
    pollingTimer = null;
    updateNotice("분석 상태 조회 중 오류가 발생했습니다.");
    setButtonDisabled(elements.runAnalysisButton, false);
  }

  return pollingTimer;
}

export async function runAnalysis({
  noteId,
  documentInput,
  audioInput,
  documentUploadId,
  audioUploadId,
  updateNotice,
  updateAnalysisChatStatus,
  updateAnalysisProgress,
  setButtonDisabled,
  elements,
}) {
  if (!noteId) {
    window.alert("note_id가 없어 분석을 진행할 수 없습니다.");
    return { success: false };
  }

  const hasDocumentFile = documentInput?.files?.[0];
  const hasAudioFile = audioInput?.files?.[0];

  if (!hasDocumentFile && !hasAudioFile) {
    return { success: false };
  }

  updateAnalysisChatStatus("분석 중입니다...");
  const uploadResult = await uploadSelectedFiles(
    noteId,
    documentInput,
    audioInput,
    updateNotice,
    updateAnalysisChatStatus,
    documentUploadId,
    audioUploadId
  );

  if (!uploadResult.success) {
    return { success: false, documentUploadId: uploadResult.documentUploadId, audioUploadId: uploadResult.audioUploadId };
  }

  updateAnalysisChatStatus("분석 작업을 생성 중입니다. 파일 업로드와 분석을 준비 중입니다...");
  updateNotice("분석 작업을 생성하는 중입니다.");
  renderEmptyResult(elements);

  try {
    const createdAnalysis = await fetchJson(`${API_BASE_URL}/notes/${noteId}/analyses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document_upload_id: uploadResult.documentUploadId,
        audio_upload_id: uploadResult.audioUploadId,
        pipeline_version: "v0.1",
        model_version_ce: "ce-v0.1",
        model_version_ae: "ae-v0.1",
      }),
    });

    if (updateAnalysisProgress) {
      updateAnalysisProgress(createdAnalysis.stage, createdAnalysis.progress);
    }

    return {
      success: true,
      documentUploadId: uploadResult.documentUploadId,
      audioUploadId: uploadResult.audioUploadId,
      analysisId: createdAnalysis.analysis_id,
      statusText: `분석 작업을 생성했습니다. 상태를 확인하는 중입니다. 현재 ${createdAnalysis.stage}, 진행률 ${createdAnalysis.progress}%`,
    };
  } catch (error) {
    console.error(error);
    updateNotice("분석 실행 중 오류가 발생했습니다.");
    updateAnalysisChatStatus("분석 작업 생성에 실패했습니다. 다시 시도해주세요.");
    setButtonDisabled(elements.runAnalysisButton, false);
    window.alert("분석 실행에 실패했습니다.");
    return { success: false, documentUploadId: uploadResult.documentUploadId, audioUploadId: uploadResult.audioUploadId };
  }
}
