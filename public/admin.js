const status = document.getElementById("status");
const rows = document.getElementById("rows");

const fMaterial = document.getElementById("fMaterial");
const fTitle = document.getElementById("fTitle");
const fType = document.getElementById("fType");
const fFile = document.getElementById("fFile");

const btnSave = document.getElementById("btnSave");
const btnReset = document.getElementById("btnReset");

function setStatus(msg, type = "info") {
  status.className = `status ${type}`;
  status.textContent = msg;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshList() {
  setStatus("Ładuję dane…", "info");
  const res = await fetch("/api/materials");
  const json = await res.json().catch(() => null);

  if (!json?.ok) {
    setStatus("Błąd pobierania listy.", "error");
    return;
  }

  rows.innerHTML = "";
  for (const r of json.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.material_no)}</td>
      <td>${escapeHtml(r.title)}</td>
      <td><span class="badge">${escapeHtml(String(r.instruction_type || "").toUpperCase())}</span></td>
      <td class="small">${escapeHtml(r.fileUrl)}</td>
      <td>
        <div class="row-actions">
          <button class="btn" data-act="delete" data-m="${escapeHtml(r.material_no)}">Usuń</button>
        </div>
      </td>
    `;
    rows.appendChild(tr);
  }

  setStatus(`OK. Rekordów: ${json.rows.length}`, "ok");
}

rows.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const act = btn.getAttribute("data-act");
  const materialNo = btn.getAttribute("data-m");

  if (act === "delete") {
    const ok = confirm(`Usunąć instrukcję dla materiału ${materialNo}?`);
    if (!ok) return;

    const res = await fetch(`/api/materials/${encodeURIComponent(materialNo)}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);

    if (!json?.ok) {
      setStatus("Nie udało się usunąć.", "error");
      return;
    }
    setStatus(`Usunięto ${materialNo}`, "ok");
    await refreshList();
  }
});

btnSave.addEventListener("click", async () => {
  const m = fMaterial.value.trim();
  const t = fTitle.value.trim();
  const type = fType.value;
  const file = fFile.files?.[0];

  if (!m || !t) return setStatus("Uzupełnij numer materiału i tytuł.", "error");
  if (!file) return setStatus("Wybierz plik instrukcji.", "error");

  const fd = new FormData();
  fd.append("material_no", m);
  fd.append("title", t);
  fd.append("instruction_type", type);
  fd.append("file", file);

  setStatus("Zapisuję…", "info");

  const res = await fetch("/api/materials", { method: "POST", body: fd });
  const json = await res.json().catch(() => null);

  if (!json?.ok) {
    setStatus(`Błąd zapisu: ${json?.error || "UNKNOWN"}`, "error");
    return;
  }

  setStatus(`Zapisano instrukcję dla ${m}`, "ok");
  fFile.value = "";
  await refreshList();
});

btnReset.addEventListener("click", () => {
  fMaterial.value = "";
  fTitle.value = "";
  fType.value = "html";
  fFile.value = "";
  setStatus("Formularz wyczyszczony.", "info");
});

(async function init() {
  await refreshList();
})();

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/admin/logout", {
      method: "POST"
    });

    window.location.href = "/login.html";
  });
}

const backBtn = document.getElementById("backBtn");

if (backBtn) {
  backBtn.addEventListener("click", () => {
    window.location.href = "/";
  });
}
