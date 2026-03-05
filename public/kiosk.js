const input = document.getElementById("scanInput");
const status = document.getElementById("status");
const result = document.getElementById("result");

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

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const materialNo = input.value.trim();
    if (!materialNo) return;
    lookup(materialNo);
    input.select();
  }
});

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

const qrOverlay = document.getElementById("qrOverlay");
const qrCloseBtn = document.getElementById("qrCloseBtn");
const qrVideo = document.getElementById("qrVideo");

let qrStream = null;
let qrRunning = false;

const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
const canCamera = () => navigator.mediaDevices?.getUserMedia;

function showQrButtonIfSupported() {
  // pokazuj na telefon/tablet + gdy jest kamera
  if (!scanQrBtn) return;
  scanQrBtn.style.display = (isTouch() && canCamera()) ? "" : "none";
}
showQrButtonIfSupported();
window.addEventListener("resize", showQrButtonIfSupported);

async function startQrScanner() {
  if (!("BarcodeDetector" in window)) {
    alert("Ta przeglądarka nie wspiera BarcodeDetector. Jeśli to iPad Safari, zrobimy fallback (jsQR).");
    return;
  }

  const detector = new BarcodeDetector({ formats: ["qr_code"] });

  qrOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    qrVideo.srcObject = qrStream;
    await qrVideo.play();

    qrRunning = true;

    const loop = async () => {
      if (!qrRunning) return;

      const barcodes = await detector.detect(qrVideo);
      if (barcodes?.length) {
        const value = (barcodes[0].rawValue || "").trim();
        if (value) {
          scanInput.value = value;
          stopQrScanner();
          lookup(value);        // <— pewniej
          scanInput.select();

        }
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);

  } catch (e) {
    console.error(e);
    alert("Nie udało się uruchomić kamery (uprawnienia?).");
    stopQrScanner();
  }
}

function stopQrScanner() {
  qrRunning = false;

  try { qrVideo.pause(); } catch { }
  qrVideo.srcObject = null;

  if (qrStream) {
    qrStream.getTracks().forEach(t => t.stop());
    qrStream = null;
  }

  qrOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  scanInput?.focus();
}

scanQrBtn?.addEventListener("click", startQrScanner);
qrCloseBtn?.addEventListener("click", stopQrScanner);

