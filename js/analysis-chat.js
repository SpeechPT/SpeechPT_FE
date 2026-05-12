import { handleDroppedFiles, preventDefaultDragDrop } from "./analysis-upload.js";

export function setupDragAndDrop(dropzone, documentInput, audioInput) {
  if (!dropzone) {
    return;
  }

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, preventDefaultDragDrop);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("drag-over");
  });

  dropzone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("drag-over");
  });

  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("drag-over");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("drag-over");

    const files = e.dataTransfer.files;
    handleDroppedFiles(files, documentInput, audioInput);
  });
}

export function bindInputListeners({
  documentInput,
  audioInput,
  filePicker,
  attachFileButton,
  runAnalysisButton,
  onRunAnalysis,
  onBack,
  onFileChanged,
  onTextSubmitted,
  onStopRequested,
  getIsBusy,
  getSelectedAttachments,
  addMessageToChat,
  chatBodyElement,
}) {
  if (documentInput) {
    documentInput.addEventListener("change", () => {
      onFileChanged("document", documentInput.files?.[0]);
    });
  }

  if (audioInput) {
    audioInput.addEventListener("change", () => {
      onFileChanged("audio", audioInput.files?.[0]);
    });
  }

  if (attachFileButton) {
    attachFileButton.addEventListener("click", () => filePicker?.click());
  }

  if (filePicker) {
    filePicker.addEventListener("change", () => {
      const files = filePicker.files;
      if (files?.length) {
        handleDroppedFiles(files, documentInput, audioInput);
      }
    });
  }

  const textInput = document.querySelector('.chat-input-box input[type="text"]');

  async function submitChat() {
    if (getIsBusy?.()) {
      onStopRequested?.();
      return;
    }

    const message = textInput?.value.trim() ?? "";
    const attachments = getSelectedAttachments();

    if (!message && attachments.length === 0) return;
    if (textInput) textInput.value = "";

    if (attachments.length > 0) {
      addMessageToChat(chatBodyElement, message, true, attachments);
      await onRunAnalysis(attachments, message);
      return;
    }

    if (message && onTextSubmitted) {
      await onTextSubmitted(message);
    }
  }

  if (runAnalysisButton) {
    runAnalysisButton.addEventListener("click", submitChat);
  }

  if (textInput) {
    textInput.addEventListener("keypress", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await submitChat();
      }
    });
  }

  if (onBack) {
    const backButton = document.getElementById("backButton");
    if (backButton) {
      backButton.addEventListener("click", onBack);
    }
  }
}
