import express from "express";
import path from "path";
import fs from "fs";
import https from "https";
import multer from "multer";
import Database from "better-sqlite3";

import session from "express-session";
import SQLiteStoreFactory from "better-sqlite3-session-store";
import argon2 from "argon2";


const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || "0.0.0.0";
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
const HTTPS_ENABLED = Boolean(SSL_KEY_PATH && SSL_CERT_PATH);

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const storageDir = path.join(rootDir, "storage");
const instructionsDir = path.join(storageDir, "instructions");
const tmpDir = path.join(storageDir, "tmp");
const dbPath = path.join(storageDir, "kiosk.sqlite");

// Ensure dirs
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(storageDir, { recursive: true });
fs.mkdirSync(instructionsDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

// DB
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS materials (
  material_no TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  instruction_type TEXT NOT NULL CHECK(instruction_type IN ('html','pdf')),
  file_name TEXT NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const SQLiteStore = SQLiteStoreFactory(session);

app.use(session({
  secret: "bardzo-dlugie-losowe-haslo-zmien-to",
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({
    client: db,
    expired: { clear: true, intervalMs: 900000 }
  }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: HTTPS_ENABLED,
    maxAge: 1000 * 60 * 60 * 8
  }
}));


app.use(express.json());

function requireAdmin(req, res, next) {
  if (req.session?.admin?.id) return next();

  return res.redirect("/login.html");
}



// Static UI + files
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password)
    return res.status(400).json({ error: "MISSING" });

  const user = db.prepare(`
    SELECT * FROM admin_users WHERE username = ?
  `).get(username);

  if (!user || user.is_active !== 1)
    return res.status(401).json({ error: "BAD_LOGIN" });

  const ok = await argon2.verify(user.password_hash, password);

  if (!ok)
    return res.status(401).json({ error: "BAD_LOGIN" });

  req.session.admin = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.use("/", (req, res, next) => {
  if (req.path === "/admin.html") {
    return res.status(403).send("Forbidden");
  }
  next();
});

app.use("/", express.static(publicDir));

app.use("/files", express.static(instructionsDir, {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store"); // żeby po podmianie nie cacheowało
  }
}));

// Upload config
const upload = multer({ dest: tmpDir });

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// List
app.get("/api/materials", (req, res) => {
  const rows = db.prepare(`
    SELECT material_no, title, instruction_type, file_name
    FROM materials
    ORDER BY material_no
  `).all();

  res.json({ ok: true, rows: rows.map(r => ({
    ...r,
    fileUrl: `/files/${r.file_name}`
  }))});
});

// Lookup
app.get("/api/materials/:materialNo", (req, res) => {
  const materialNo = String(req.params.materialNo || "").trim();
  if (!materialNo) return res.status(400).json({ ok: false, error: "EMPTY" });

  const row = db.prepare(`
    SELECT material_no, title, instruction_type, file_name
    FROM materials
    WHERE material_no = ?
  `).get(materialNo);

  if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

  res.json({
    ok: true,
    data: {
      material_no: row.material_no,
      title: row.title,
      instruction_type: row.instruction_type,
      fileUrl: `/files/${row.file_name}`
    }
  });
});

// Upsert (multipart/form-data)
// fields: material_no, title, instruction_type, file
app.post("/api/materials", requireAdmin, upload.single("file"), (req, res) => {

  try {
    const material_no = String(req.body.material_no || "").trim();
    const title = String(req.body.title || "").trim();
    const instruction_type = String(req.body.instruction_type || "").trim().toLowerCase();

    if (!material_no || !title) return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    if (!["pdf", "html"].includes(instruction_type)) return res.status(400).json({ ok: false, error: "BAD_TYPE" });
    if (!req.file) return res.status(400).json({ ok: false, error: "NO_FILE" });

    const ext = instruction_type === "pdf" ? ".pdf" : ".html";
    const file_name = `${material_no}${ext}`;
    const dest = path.join(instructionsDir, file_name);

    // podmiana pliku
    fs.renameSync(req.file.path, dest);

    db.prepare(`
      INSERT INTO materials(material_no, title, instruction_type, file_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(material_no) DO UPDATE SET
        title = excluded.title,
        instruction_type = excluded.instruction_type,
        file_name = excluded.file_name
    `).run(material_no, title, instruction_type, file_name);

    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/materials error:", e);
    res.status(500).json({ ok: false, error: e?.message || "SERVER_ERROR" });
  }
});

// Delete
app.delete("/api/materials/:materialNo", requireAdmin, (req, res) => {

  try {
    const materialNo = String(req.params.materialNo || "").trim();
    if (!materialNo) return res.status(400).json({ ok: false, error: "EMPTY" });

    const row = db.prepare(`SELECT file_name FROM materials WHERE material_no = ?`).get(materialNo);
    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    db.prepare(`DELETE FROM materials WHERE material_no = ?`).run(materialNo);

    const fp = path.join(instructionsDir, row.file_name);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/materials error:", e);
    res.status(500).json({ ok: false, error: e?.message || "SERVER_ERROR" });
  }
});

if (HTTPS_ENABLED) {
  const key = fs.readFileSync(SSL_KEY_PATH, "utf8");
  const cert = fs.readFileSync(SSL_CERT_PATH, "utf8");

  https.createServer({ key, cert }, app).listen(PORT, HOST, () => {
    console.log(`Packing Kiosk HTTPS running on https://${HOST}:${PORT}`);
  });
} else {
  app.listen(PORT, HOST, () => {
    console.log(`Packing Kiosk Server running on http://${HOST}:${PORT}`);
  });
  console.log("HTTPS disabled. Set SSL_KEY_PATH and SSL_CERT_PATH to enable HTTPS.");
}

const createInitialAdmin = async () => {
  const exists = db.prepare("SELECT 1 FROM admin_users WHERE username = ?").get("admin");
  if (!exists) {
    const hash = await argon2.hash("Haslo123");
    db.prepare(`
      INSERT INTO admin_users (username, password_hash)
      VALUES (?, ?)
    `).run("admin", hash);

    console.log("Admin created: admin / Haslo123");
  }
};

createInitialAdmin().catch(err => {
  console.error("Admin init error:", err);
});

