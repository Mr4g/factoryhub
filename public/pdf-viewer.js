import * as pdfjsLib from "./vendor/pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.mjs";


const wrap = document.getElementById("pdfWrap");
const params = new URLSearchParams(location.search);
const src = params.get("src"); // np. /files/123456.pdf

let currentScale = "fitHeight";

const zoomLevel = document.getElementById("zoomLevel");


if (!src) {
    wrap.textContent = "Brak parametru src";
    throw new Error("Missing src");
}

let pdfDoc = null;
let renderToken = 0;

async function renderAllPages() {

    if (!pdfDoc) return;
    const token = ++renderToken;

    wrap.innerHTML = "";
    const isMobileGlobal = window.matchMedia("(max-width: 768px)").matches;
    const containerWidth = wrap.clientWidth - (isMobileGlobal ? 0 : 20);


    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (token !== renderToken) return; // przerwij jeśli przyszło nowe renderowanie

        const page = await pdfDoc.getPage(pageNum);

        const isMobile = window.matchMedia("(max-width: 768px)").matches;
        let rotation = 0;
        if (isMobile) {
            const vp = page.getViewport({ scale: 1 });
            const isLandscape = vp.width > vp.height;
            rotation = isLandscape ? 90 : 0;
        }

        // viewport bazowy (już z rotacją!)
        const baseViewport = page.getViewport({ scale: 1, rotation });
        let scale;

        const toolbar = document.getElementById("pdfToolbar");
        const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 0;
        const availableHeight = Math.max(200, window.innerHeight - toolbarH - 16);

        if (currentScale === "fitWidth") {
            scale = containerWidth / baseViewport.width;

        } else if (currentScale === "fitHeight") {

            if (pageNum === 1) {
                scale = availableHeight / baseViewport.height;
            } else {
                scale = containerWidth / baseViewport.width;
            }

        } else {
            scale = currentScale;
        }


        // viewport docelowy
        const viewport = page.getViewport({ scale, rotation });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        wrap.appendChild(canvas);

        await page.render({ canvasContext: ctx, viewport }).promise;
    }
}

function debounce(fn, ms = 150) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

(async () => {
    pdfDoc = await pdfjsLib.getDocument(src).promise;
    await renderAllPages();


    window.addEventListener("resize", debounce(renderAllPages, 200));

})();


const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomFitWidthBtn = document.getElementById("zoomFitWidth");
const zoomFitHeightBtn = document.getElementById("zoomFitHeight");


function updateZoomLabel() {
    if (currentScale === "fitWidth") {
        zoomLevel.textContent = "Fit W";
    } else if (currentScale === "fitHeight") {
        zoomLevel.textContent = "Fit H";
    } else {
        zoomLevel.textContent = Math.round(currentScale * 100) + "%";
    }
}


zoomInBtn?.addEventListener("click", async () => {
    if (typeof currentScale !== "number") currentScale = 1;
    currentScale += 0.1;
    updateZoomLabel();
    await renderAllPages();

});

zoomOutBtn?.addEventListener("click", async () => {
    if (currentScale === "fit") currentScale = 1;
    currentScale = Math.max(0.3, currentScale - 0.1);
    updateZoomLabel();
    await renderAllPages();

});

zoomFitWidthBtn?.addEventListener("click", async () => {
  currentScale = "fitWidth";
  updateZoomLabel();
  await renderAllPages();
});

zoomFitHeightBtn?.addEventListener("click", async () => {
  currentScale = "fitHeight";
  updateZoomLabel();
  await renderAllPages();
});



currentScale = "fitHeight";
updateZoomLabel();

