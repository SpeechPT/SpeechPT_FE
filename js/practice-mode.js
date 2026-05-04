let audioCtx = null;
let analyser = null;
let micStream = null;
let liveRafId = null;
let idleRafId = null;
let isRunning = false;
let practiceScores = null;
let waveCanvas = null;
let waveCtx = null;
let idlePhase = 0;

export function initPracticeMode() {
  waveCanvas = document.getElementById("practiceWaveCanvas");
  if (waveCanvas) waveCtx = waveCanvas.getContext("2d");

  setupRingCanvases();

  document.getElementById("closePracticeModal")
    ?.addEventListener("click", closePracticeModal);

  document.getElementById("practiceModeModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "practiceModeModal") closePracticeModal();
    });

  document.getElementById("practiceMicButton")
    ?.addEventListener("click", toggleMicrophone);
}

function setupRingCanvases() {
  const dpr = window.devicePixelRatio || 1;
  const cssSize = 140;
  ["practiceRingContent", "practiceRingDelivery", "practiceRingPacing"].forEach((id) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = cssSize + "px";
    canvas.style.height = cssSize + "px";
  });
}

export function openPracticeModal(scores) {
  practiceScores = scores;
  const modal = document.getElementById("practiceModeModal");
  if (!modal) return;
  modal.classList.add("active");

  requestAnimationFrame(() => {
    resizeWaveCanvas();
    drawRings(scores, null);
    startIdleAnimation();
  });
}

export function closePracticeModal() {
  const modal = document.getElementById("practiceModeModal");
  if (!modal) return;

  stopMicrophoneInternal();
  stopIdleAnimation();
  resetMicUI();
  modal.classList.remove("active");
}

function resizeWaveCanvas() {
  if (!waveCanvas) return;
  const parent = waveCanvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  waveCanvas.width = Math.round(rect.width * dpr);
  waveCanvas.height = Math.round(rect.height * dpr);
  waveCanvas.style.width = rect.width + "px";
  waveCanvas.style.height = rect.height + "px";
}

function resetMicUI() {
  const micBtn = document.getElementById("practiceMicButton");
  const micLabel = document.getElementById("practiceMicLabel");
  const micStatus = document.getElementById("practiceMicStatus");
  if (micBtn) micBtn.classList.remove("active");
  if (micLabel) micLabel.textContent = "마이크 시작";
  if (micStatus) micStatus.textContent = "마이크 버튼을 눌러 연습을 시작하세요";
  updateMeters(0, -1);
}

async function toggleMicrophone() {
  if (isRunning) {
    stopMicrophoneInternal();
    resetMicUI();
    drawRings(practiceScores, null);
    startIdleAnimation();
  } else {
    await startMicrophoneInternal();
  }
}

async function startMicrophoneInternal() {
  const micStatus = document.getElementById("practiceMicStatus");
  if (micStatus) micStatus.textContent = "마이크 접근 권한을 요청 중입니다...";

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    const msg =
      err.name === "NotAllowedError"
        ? "마이크 접근이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요."
        : `마이크를 사용할 수 없습니다: ${err.message}`;
    if (micStatus) micStatus.textContent = msg;
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;

  const source = audioCtx.createMediaStreamSource(micStream);
  source.connect(analyser);

  isRunning = true;
  stopIdleAnimation();

  const micBtn = document.getElementById("practiceMicButton");
  const micLabel = document.getElementById("practiceMicLabel");
  if (micBtn) micBtn.classList.add("active");
  if (micLabel) micLabel.textContent = "중지";
  if (micStatus) micStatus.textContent = "실시간 음성 분석 중...";

  drawLiveLoop();
}

function stopMicrophoneInternal() {
  if (!isRunning) return;
  isRunning = false;

  if (liveRafId) { cancelAnimationFrame(liveRafId); liveRafId = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
  analyser = null;
}

// ─── Idle animation ───────────────────────────────────────────

function startIdleAnimation() {
  stopIdleAnimation();
  idlePhase = 0;
  function tick() {
    idleRafId = requestAnimationFrame(tick);
    idlePhase += 0.015;
    drawIdleWave();
  }
  idleRafId = requestAnimationFrame(tick);
}

function stopIdleAnimation() {
  if (idleRafId) { cancelAnimationFrame(idleRafId); idleRafId = null; }
}

function drawIdleWave() {
  if (!waveCanvas || !waveCtx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = waveCanvas.width / dpr;
  const H = waveCanvas.height / dpr;

  waveCtx.save();
  waveCtx.scale(dpr, dpr);

  waveCtx.fillStyle = "#080c1e";
  waveCtx.fillRect(0, 0, W, H);

  waveCtx.beginPath();
  for (let x = 0; x <= W; x++) {
    const y =
      H / 2 +
      Math.sin(x * 0.018 + idlePhase) * 6 +
      Math.sin(x * 0.045 + idlePhase * 1.4) * 3;
    if (x === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.strokeStyle = "rgba(93, 168, 255, 0.3)";
  waveCtx.lineWidth = 1.5;
  waveCtx.stroke();

  waveCtx.fillStyle = "rgba(93, 168, 255, 0.35)";
  waveCtx.font = "13px sans-serif";
  waveCtx.textAlign = "center";
  waveCtx.textBaseline = "middle";
  waveCtx.fillText("마이크를 시작하면 실시간 음성이 표시됩니다", W / 2, H / 2 + 26);

  waveCtx.restore();
}

// ─── Live audio loop ──────────────────────────────────────────

function drawLiveLoop() {
  if (!isRunning || !analyser) return;
  liveRafId = requestAnimationFrame(drawLiveLoop);

  const bufLen = analyser.frequencyBinCount;
  const timeData = new Uint8Array(bufLen);
  const freqData = new Uint8Array(bufLen);
  const floatData = new Float32Array(analyser.fftSize);

  analyser.getByteTimeDomainData(timeData);
  analyser.getByteFrequencyData(freqData);
  analyser.getFloatTimeDomainData(floatData);

  const rms = calcRMS(timeData);
  const pitch = detectPitch(floatData, audioCtx.sampleRate);

  drawLiveWave(timeData, freqData);
  updateMeters(rms, pitch);

  const deliveryLive = Math.min(rms * 500, 100);
  const pacingLive =
    pitch > 0 && pitch < 1200
      ? Math.min(Math.max(((pitch - 80) / 320) * 100, 0), 100)
      : 0;

  drawRings(practiceScores, { delivery: deliveryLive, pacing: pacingLive });
}

function calcRMS(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

// Autocorrelation-based pitch detection
function detectPitch(buffer, sampleRate) {
  const SIZE = Math.min(buffer.length, 1024);
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  if (Math.sqrt(rms / SIZE) < 0.008) return -1;

  const c = new Float32Array(SIZE);
  for (let lag = 0; lag < SIZE; lag++) {
    let s = 0;
    for (let i = 0; i < SIZE - lag; i++) s += buffer[i] * buffer[i + lag];
    c[lag] = s;
  }

  let d = 0;
  while (d < SIZE - 1 && c[d] >= c[d + 1]) d++;

  let maxVal = -Infinity;
  let maxPos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }

  if (maxPos <= 1) return -1;

  if (maxPos > 0 && maxPos < SIZE - 1) {
    const y1 = c[maxPos - 1], y2 = c[maxPos], y3 = c[maxPos + 1];
    const a = (y1 + y3 - 2 * y2) / 2;
    if (a !== 0) {
      const truePos = maxPos - (y3 - y1) / (4 * a);
      return sampleRate / truePos;
    }
  }

  return sampleRate / maxPos;
}

function drawLiveWave(timeData, freqData) {
  if (!waveCanvas || !waveCtx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = waveCanvas.width / dpr;
  const H = waveCanvas.height / dpr;

  waveCtx.save();
  waveCtx.scale(dpr, dpr);

  // Trail fade
  waveCtx.fillStyle = "rgba(8, 12, 30, 0.75)";
  waveCtx.fillRect(0, 0, W, H);

  // Frequency bars (subtle background)
  const barsCount = Math.min(freqData.length / 2, 128);
  const barW = W / barsCount;
  for (let i = 0; i < barsCount; i++) {
    const barH = (freqData[i] / 255) * H * 0.65;
    const hue = 200 + (i / barsCount) * 50;
    waveCtx.fillStyle = `hsla(${hue}, 70%, 55%, 0.2)`;
    waveCtx.fillRect(i * barW, H - barH, barW - 0.5, barH);
  }

  // Waveform line
  const grad = waveCtx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#4a6cff");
  grad.addColorStop(0.5, "#5da8ff");
  grad.addColorStop(1, "#00d4ff");

  waveCtx.beginPath();
  const slice = W / timeData.length;
  for (let i = 0; i < timeData.length; i++) {
    const y = ((timeData[i] / 128) * H) / 2;
    if (i === 0) waveCtx.moveTo(0, y);
    else waveCtx.lineTo(i * slice, y);
  }
  waveCtx.strokeStyle = grad;
  waveCtx.lineWidth = 2;
  waveCtx.shadowBlur = 10;
  waveCtx.shadowColor = "#5da8ff";
  waveCtx.stroke();
  waveCtx.shadowBlur = 0;

  waveCtx.restore();
}

// ─── Meters ───────────────────────────────────────────────────

function updateMeters(rms, pitch) {
  const volFill = document.getElementById("practiceVolumeFill");
  const volValue = document.getElementById("practiceVolumeValue");
  const pitchFill = document.getElementById("practicePitchFill");
  const pitchValue = document.getElementById("practicePitchValue");

  if (volFill) {
    const pct = Math.min(rms * 400, 100);
    volFill.style.width = pct + "%";
    if (pct < 10) volFill.style.background = "rgba(255,255,255,0.15)";
    else if (pct < 20) volFill.style.background = "#ffda4a";
    else if (pct < 65) volFill.style.background = "linear-gradient(90deg,#4aff8c,#00d4aa)";
    else volFill.style.background = "linear-gradient(90deg,#ff8c00,#ff4a6b)";
  }
  if (volValue) {
    volValue.textContent = rms > 0.005 ? Math.round(rms * 400) + "%" : "0%";
  }

  if (pitchFill) {
    if (pitch <= 0 || pitch > 1200) {
      pitchFill.style.width = "0%";
    } else {
      const pct = Math.min(Math.max(((pitch - 80) / 320) * 100, 0), 100);
      pitchFill.style.width = pct + "%";
      pitchFill.style.background = "linear-gradient(90deg,#4a6cff,#5da8ff)";
    }
  }
  if (pitchValue) {
    pitchValue.textContent = pitch > 0 && pitch < 1200 ? Math.round(pitch) + " Hz" : "-";
  }
}

// ─── Score rings ──────────────────────────────────────────────

function drawRings(targetScores, liveScores) {
  drawSingleRing("practiceRingContent", targetScores?.contentCoverage ?? null, null);
  drawSingleRing("practiceRingDelivery", targetScores?.deliveryStability ?? null, liveScores?.delivery ?? null);
  drawSingleRing("practiceRingPacing", targetScores?.pacingScore ?? null, liveScores?.pacing ?? null);
}

function drawSingleRing(canvasId, targetScore, liveScore) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const cssSize = 140;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  const cx = cssSize / 2;
  const cy = cssSize / 2;
  const outerR = cssSize * 0.39;
  const innerR = cssSize * 0.28;
  const lw = cssSize * 0.075;

  // Background track
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = lw;
  ctx.stroke();

  // Target arc (blue glow)
  const numTarget = targetScore !== null && targetScore !== undefined ? Number(targetScore) : null;
  if (numTarget !== null && !isNaN(numTarget)) {
    const norm = Math.min(Math.max(numTarget / 100, 0), 1);
    const startA = -Math.PI / 2;
    const endA = startA + Math.PI * 2 * norm;

    const grad = ctx.createLinearGradient(0, 0, cssSize, cssSize);
    grad.addColorStop(0, "#4a6cff");
    grad.addColorStop(1, "#5da8ff");

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startA, endA);
    ctx.strokeStyle = grad;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(93,168,255,0.65)";
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Live arc (inner ring — shown only when mic is running)
  if (liveScore !== null && liveScore !== undefined && isRunning) {
    const norm = Math.min(Math.max(liveScore / 100, 0), 1);
    const diff = numTarget !== null ? Math.abs(liveScore - numTarget) : 50;
    const liveColor = diff < 15 ? "#4aff8c" : diff < 30 ? "#ffda4a" : "#ff6b6b";

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * norm);
    ctx.strokeStyle = liveColor;
    ctx.lineWidth = lw * 0.5;
    ctx.lineCap = "round";
    ctx.shadowBlur = 8;
    ctx.shadowColor = liveColor;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Center value
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(cssSize * 0.185)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const displayVal =
    numTarget !== null && !isNaN(numTarget) ? Math.round(numTarget) : "-";
  ctx.fillText(String(displayVal), cx, cy);

  ctx.restore();
}
