/**
 * CIRAD Analyse d'offres — Backend Server
 * 
 * Serveur Node.js autonome avec SQLite embarqué.
 * Aucune dépendance externe à Internet requise.
 */

const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");
const { ImportedProjectSchema } = require("./validation");

const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, "analyses.db");
const STATIC_DIR = path.join(__dirname, "public");

// Lock expiration: 30 minutes
const LOCK_TTL_MS = 30 * 60 * 1000;

// ─── Database Setup ───────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS locks (
    project_id TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    locked_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// Add owner column if missing (migration for existing DBs)
try {
  db.exec("ALTER TABLE projects ADD COLUMN owner TEXT NOT NULL DEFAULT ''");
} catch { /* column already exists */ }

// Prepared statements
const stmts = {
  listProjects: db.prepare("SELECT id, owner, data, updated_at FROM projects ORDER BY updated_at DESC"),
  getProject: db.prepare("SELECT id, owner, data FROM projects WHERE id = ?"),
  upsertProject: db.prepare(`
    INSERT INTO projects (id, owner, data, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')
  `),
  deleteProject: db.prepare("DELETE FROM projects WHERE id = ? AND owner = ?"),

  getLock: db.prepare("SELECT project_id, locked_by, locked_at FROM locks WHERE project_id = ?"),
  getAllLocks: db.prepare("SELECT project_id, locked_by, locked_at FROM locks"),
  upsertLock: db.prepare(`
    INSERT INTO locks (project_id, locked_by, locked_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(project_id) DO UPDATE SET locked_by = excluded.locked_by, locked_at = datetime('now')
  `),
  deleteLock: db.prepare("DELETE FROM locks WHERE project_id = ?"),
  deleteLockByUser: db.prepare("DELETE FROM locks WHERE project_id = ? AND locked_by = ?"),
};

function isLockStale(lockedAt) {
  return Date.now() - new Date(lockedAt).getTime() > LOCK_TTL_MS;
}

// ─── Express App ──────────────────────────────────────────────────

const app = express();

// CORS: restrict to known origins
const allowedOrigins = [
  "http://localhost:8080",
  "http://localhost:3001",
  "http://localhost:5173",
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

// ─── Auth Middleware ──────────────────────────────────────────────
// Uses X-User-Id header for user identification (intranet context)

function requireUser(req, res, next) {
  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    return res.status(401).json({ error: "Identification requise (header X-User-Id manquant)" });
  }
  req.userId = userId.trim();
  next();
}

// Ownership check middleware (for project-specific routes)
function requireOwnership(req, res, next) {
  const row = stmts.getProject.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Projet introuvable" });
  // If project has no owner (legacy), allow and adopt
  if (row.owner && row.owner !== "" && row.owner !== req.userId) {
    return res.status(403).json({ error: "Accès refusé : vous n'êtes pas le propriétaire de ce projet" });
  }
  req.projectRow = row;
  next();
}

// ─── API Routes ───────────────────────────────────────────────────

// List all projects (only user's projects)
app.get("/api/projects", requireUser, (req, res) => {
  const rows = stmts.listProjects.all();
  const projects = rows
    .filter((r) => {
      // Show projects owned by user OR unowned (legacy)
      return !r.owner || r.owner === "" || r.owner === req.userId;
    })
    .map((r) => {
      const p = JSON.parse(r.data);
      return {
        id: p.id,
        name: p.info?.name || "Sans titre",
        marketRef: p.info?.marketRef ?? "",
        lotAnalyzed: p.info?.lotAnalyzed ?? "",
        updatedAt: r.updated_at,
      };
    });
  res.json(projects);
});

// Get full project data (with ownership check)
app.get("/api/projects/:id", requireUser, requireOwnership, (req, res) => {
  res.json(JSON.parse(req.projectRow.data));
});

// Save (create or update) a project (with ownership + schema validation)
app.put("/api/projects/:id", requireUser, (req, res) => {
  // Validate against Zod schema
  const result = ImportedProjectSchema.safeParse(req.body);
  if (!result.success) {
    const messages = result.error.issues.slice(0, 5).map(i => `${i.path.join(".")}: ${i.message}`);
    return res.status(400).json({ error: "Données invalides", details: messages });
  }
  const project = result.data;
  if (project.id !== req.params.id) {
    return res.status(400).json({ error: "Données invalides : ID incohérent" });
  }
  // Check ownership for existing projects
  const existing = stmts.getProject.get(req.params.id);
  if (existing && existing.owner && existing.owner !== "" && existing.owner !== req.userId) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  const owner = existing?.owner && existing.owner !== "" ? existing.owner : req.userId;
  stmts.upsertProject.run(project.id, owner, JSON.stringify(project));
  res.json({ ok: true });
});

// Delete a project (only owner)
app.delete("/api/projects/:id", requireUser, (req, res) => {
  const result = stmts.deleteProject.run(req.params.id, req.userId);
  if (result.changes === 0) {
    // Check if project exists but owned by another
    const row = stmts.getProject.get(req.params.id);
    if (row) return res.status(403).json({ error: "Accès refusé" });
    return res.status(404).json({ error: "Projet introuvable" });
  }
  res.json({ ok: true });
});

// ─── Lock Routes ──────────────────────────────────────────────────

app.get("/api/locks", (_req, res) => {
  const rows = stmts.getAllLocks.all();
  const locks = {};
  for (const r of rows) {
    if (!isLockStale(r.locked_at)) {
      locks[r.project_id] = { lockedBy: r.locked_by, lockedAt: r.locked_at };
    } else {
      stmts.deleteLock.run(r.project_id);
    }
  }
  res.json(locks);
});

app.post("/api/locks/:projectId", requireUser, (req, res) => {
  const { projectId } = req.params;
  const userId = req.userId;

  const existing = stmts.getLock.get(projectId);
  if (existing && existing.locked_by !== userId && !isLockStale(existing.locked_at)) {
    return res.status(409).json({
      error: "Projet verrouillé",
      lock: { lockedBy: existing.locked_by, lockedAt: existing.locked_at },
    });
  }

  stmts.upsertLock.run(projectId, userId);
  res.json({ ok: true });
});

app.delete("/api/locks/:projectId", requireUser, (req, res) => {
  stmts.deleteLockByUser.run(req.params.projectId, req.userId);
  res.json({ ok: true });
});

app.post("/api/locks/:projectId/heartbeat", requireUser, (req, res) => {
  const { projectId } = req.params;
  const userId = req.userId;

  const existing = stmts.getLock.get(projectId);
  if (existing && existing.locked_by === userId) {
    stmts.upsertLock.run(projectId, userId);
    return res.json({ ok: true });
  }
  res.status(404).json({ error: "Verrou introuvable" });
});

// ─── Global Error Handler ────────────────────────────────────────

app.use((err, _req, res, _next) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.error(`[ERROR ${requestId}]`, {
    timestamp: new Date().toISOString(),
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    error: "Une erreur interne est survenue. Veuillez réessayer.",
    requestId,
  });
});

// ─── Serve Frontend Static Files ─────────────────────────────────

app.use(express.static(STATIC_DIR));
app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

// ─── Start ────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ Serveur CIRAD démarré sur http://localhost:${PORT}`);
  console.log(`📁 Base de données : ${DB_PATH}`);
  console.log(`📂 Frontend servi depuis : ${STATIC_DIR}\n`);
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
