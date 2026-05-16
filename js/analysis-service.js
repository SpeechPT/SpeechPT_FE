import { API_BASE_URL, fetchJson, uploadSelectedFiles } from "./analysis-upload.js";
import { renderEmptyResult, setElementText, renderTextList, renderSections, renderTranscript, renderDocumentPreview, renderContentCoverage } from "./analysis-render.js";
import { authFetch } from "./auth.js";

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

async function _restoreDocumentPreview(uploadId, filename, previewElement) {
  if (!uploadId || !previewElement) return;
  try {
    const response = await authFetch(`${API_BASE_URL}/uploads/${uploadId}/file`);
    if (!response.ok) return;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // S3: backend returns presigned URL as JSON — use directly as iframe src (no CORS issue)
      const json = await response.json();
      if (!json.preview_url) return;
      const fileInfo = {
        name: json.filename || filename || "document",
        type: json.content_type || "application/pdf",
        size: 0,
      };
      renderDocumentPreview(previewElement, fileInfo, json.preview_url);
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

export async function fetchLatestAnalysisResult({ noteId, elements, updateNotice, onComplete, onNoResult, onSectionPlay }) {
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
    renderSections(elements.sectionsListElement, result.sections, onSectionPlay);
    updateNotice("이전 분석 결과를 불러왔습니다.");

    if (result.document_upload_id) {
      _restoreDocumentPreview(result.document_upload_id, result.document_filename, elements.documentPreviewElement);
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

export async function fetchAnalysisResult({ analysisId, elements, updateNotice, updateAnalysisChatStatus, updateAnalysisProgress, setButtonDisabled, onComplete, onSectionPlay }) {
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
    renderSections(elements.sectionsListElement, result.sections, onSectionPlay);
    if (updateAnalysisProgress) {
      updateAnalysisProgress(result.stage ?? "완료", 100);
    }
    updateAnalysisChatStatus("분석이 완료되었습니다. 결과를 확인하세요.");
    updateNotice("분석 결과를 불러왔습니다.");

    if (result.document_upload_id) {
      _restoreDocumentPreview(result.document_upload_id, result.document_filename, elements.documentPreviewElement);
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
    if (updateAnalysisProgress) {
      updateAnalysisProgress(statusData.stage, statusData.progress);
    } else {
      updateAnalysisChatStatus(`분석 중... ${statusData.stage} / 진행률 ${statusData.progress}%`);
    }

    if (statusData.status === "done") {
      window.clearInterval(pollingTimer);
      pollingTimer = null;
      await fetchAnalysisResult();
      if (updateAnalysisProgress) {
        updateAnalysisProgress(statusData.stage ?? "완료", 100);
      }
      setButtonDisabled(elements.runAnalysisButton, false);
      return pollingTimer;
    }

    if (statusData.status === "failed") {
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
