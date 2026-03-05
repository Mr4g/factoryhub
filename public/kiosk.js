const input = document.getElementById("scanInput");
const status = document.getElementById("status");
const result = document.getElementById("result");
const confirmBtn = document.getElementById("confirmBtn");

const mNo = document.getElementById("mNo");
const mTitle = document.getElementById("mTitle");
const mType = document.getElementById("mType");
const mPath = document.getElementById("mPath");

const htmlBox = document.getElementById("htmlBox");
const pdfBox = document.getElementById("pdfBox");
const pdfFrame = document.getElementById("pdfFrame");

const fsOverlay = document.getElementById("fsOverlay");
const fsBackBtn = document.getElementById("fsBackBtn");
const fsContent = document.getElementById("fsContent");
const fsTitle = document.getElementById("fsTitle");

const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

function setStatus(msg, type = "info") {
  status.className = `status ${type}`;
  status.textContent = msg;
}

function resetView() {
  htmlBox.classList.add("hidden");
  pdfBox.classList.add("hidden");
  htmlBox.innerHTML = "";
  pdfFrame.src = "about:blank";
  result.classList.add("hidden");
}

async function lookup(materialNo) {
  setStatus(`Szukam instrukcji dla: ${materialNo}…`, "info");
  resetView();

  const res = await fetch(`/api/materials/${encodeURIComponent(materialNo)}`);
  const json = await res.json().catch(() => null);

  if (!json?.ok) {
    if (json?.error === "NOT_FOUND") setStatus(`Brak instrukcji dla materiału: ${materialNo}`, "error");
    else setStatus("Błąd wyszukiwania.", "error");
    return;
  }

  const d = json.data;

  mNo.textContent = d.material_no;
  mTitle.textContent = d.title;
  mType.textContent = d.instruction_type.toUpperCase();
  mPath.textContent = d.fileUrl;

  result.classList.remove("hidden");

  if (d.instruction_type === "html") {
    setStatus("OK", "ok");
    const html = `<iframe class="frame" src="${d.fileUrl}"></iframe>`;
    openFullscreen(html, `Materiał: ${d.material_no || ""}`);
  } else {
    setStatus("OK", "ok");
    const viewerUrl = `/pdf-viewer.html?src=${encodeURIComponent(d.fileUrl)}`;
    const html = `<iframe class="frame" src="${viewerUrl}"></iframe>`;
    openFullscreen(html, `Materiał: ${d.material_no || ""}`);
  }


}

function submitLookup() {
  const materialNo = input.value.trim();
  if (!materialNo) return;
  lookup(materialNo);
  input.select();
}

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitLookup();
});

confirmBtn?.addEventListener("click", submitLookup);

document.getElementById("clearBtn")?.addEventListener("click", () => {
  closeFullscreen();        // <— ważne
  input.value = "";
  input.focus();
  setStatus("Gotowe.", "ok");
  resetView();
});


function openFullscreen(contentHtml, title = "Instrukcja") {
  fsTitle.textContent = title;
  fsContent.innerHTML = contentHtml;
  fsOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeFullscreen() {
  fsOverlay.classList.add("hidden");
  fsContent.innerHTML = "";
  document.body.style.overflow = "";
  input.value = "";
  setStatus("Gotowe.", "ok");
  resetView();

  input.focus();
}


fsBackBtn?.addEventListener("click", closeFullscreen)

const scanInput = document.getElementById("scanInput");
const scanQrBtn = document.getElementById("scanQrBtn");
const qrImageInput = document.getElementById("qrImageInput");

const qrOverlay = document.getElementById("qrOverlay");
const qrCloseBtn = document.getElementById("qrCloseBtn");
const qrVideo = document.getElementById("qrVideo");
const qrCameraSelect = document.getElementById("qrCameraSelect");
const qrPickImageBtn = document.getElementById("qrPickImageBtn");

let qrStream = null;
let qrRunning = false;
let qrDetector = null;
let lastDeviceId = "";

const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
const canLiveCamera = () => navigator.mediaDevices?.getUserMedia && window.isSecureContext;
const canDetectQr = () => "BarcodeDetector" in window;

function showQrButtonIfSupported() {
  if (!scanQrBtn) return;
  scanQrBtn.style.display = isTouch() ? "" : "none";
}
showQrButtonIfSupported();
window.addEventListener("resize", showQrButtonIfSupported);

function applyDetectedQr(value) {
  scanInput.value = value;
  stopQrScanner();
  lookup(value);
  scanInput.select();
}

async function detectFromImageFile(file) {
  if (!file) return;
  if (!canDetectQr()) {
    setStatus("Twoja przeglądarka nie wspiera skanowania QR z obrazu.", "error");
    return;
  }

  try {
    qrDetector = qrDetector || new BarcodeDetector({ formats: ["qr_code"] });
    const bitmap = await createImageBitmap(file);
    const barcodes = await qrDetector.detect(bitmap);
    bitmap.close();

    const value = (barcodes?.[0]?.rawValue || "").trim();
    if (!value) {
      setStatus("Nie wykryto kodu QR na zdjęciu.", "warn");
      return;
    }

    applyDetectedQr(value);
  } catch (e) {
    console.error(e);
    setStatus("Nie udało się odczytać QR ze zdjęcia.", "error");
  }
}

async function loadCameraList(selectedDeviceId = "") {
  if (!qrCameraSelect || !navigator.mediaDevices?.enumerateDevices) return;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput");

  qrCameraSelect.innerHTML = "";

  cameras.forEach((cam, idx) => {
    const opt = document.createElement("option");
    opt.value = cam.deviceId;
    opt.textContent = cam.label || `Aparat ${idx + 1}`;
    qrCameraSelect.appendChild(opt);
  });

  if (!cameras.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Brak kamer";
    qrCameraSelect.appendChild(opt);
  }

  if (selectedDeviceId) qrCameraSelect.value = selectedDeviceId;
}

async function openLiveScanner(deviceId = "") {
  qrDetector = qrDetector || new BarcodeDetector({ formats: ["qr_code"] });

  const videoConstraints = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: "environment" };

  qrStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
  qrVideo.srcObject = qrStream;
  await qrVideo.play();

  await loadCameraList(deviceId || qrStream.getVideoTracks()[0]?.getSettings?.().deviceId || "");
  lastDeviceId = qrCameraSelect?.value || deviceId || "";

  qrRunning = true;
  const loop = async () => {
    if (!qrRunning) return;

    try {
      const barcodes = await qrDetector.detect(qrVideo);
      const value = (barcodes?.[0]?.rawValue || "").trim();
      if (value) return applyDetectedQr(value);
    } catch {}

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

async function startQrScanner() {
  if (!canDetectQr()) {
    setStatus("Brak wsparcia skanowania QR w tej przeglądarce.", "error");
    return;
  }

  if (!canLiveCamera()) {
    setStatus("HTTP: otwieram aparat jako zdjęcie do skanowania QR.", "warn");
    qrImageInput?.click();
    return;
  }

  qrOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  try {
    await openLiveScanner(lastDeviceId);
  } catch (e) {
    console.error(e);
    setStatus("Nie udało się uruchomić kamery live. Użyj opcji Zdjęcie.", "warn");
  }
}

function stopQrScanner() {
  qrRunning = false;

  try { qrVideo.pause(); } catch {}
  qrVideo.srcObject = null;

  if (qrStream) {
    qrStream.getTracks().forEach((t) => t.stop());
    qrStream = null;
  }

  qrOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  scanInput?.focus();
}

scanQrBtn?.addEventListener("click", startQrScanner);
qrCloseBtn?.addEventListener("click", stopQrScanner);

qrCameraSelect?.addEventListener("change", async (e) => {
  const nextId = String(e.target.value || "");
  if (!nextId || nextId === lastDeviceId) return;

  try {
    stopQrScanner();
    qrOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    await openLiveScanner(nextId);
  } catch (err) {
    console.error(err);
    setStatus("Nie udało się przełączyć aparatu.", "error");
  }
});

qrPickImageBtn?.addEventListener("click", () => qrImageInput?.click());

qrImageInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  await detectFromImageFile(file);
  e.target.value = "";
});
