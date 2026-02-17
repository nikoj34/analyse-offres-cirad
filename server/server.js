/**
 * CIRAD Analyse d'offres — Backend Server
 * 
 * Serveur Node.js autonome avec SQLite embarqué.
 * Aucune dépendance externe à Internet requise.
 * 
 * Installation (une seule fois) :
 *   cd server
 *   npm install
 * 
 * Lancement :
 *   node server.js
 * 
 * Le serveur sert à la fois l'API REST et les fichiers statiques du frontend.
 */

const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const cors = require("cors");

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

// Prepared statements
const stmts = {
  listProjects: db.prepare("SELECT id, data, updated_at FROM projects ORDER BY updated_at DESC"),
  getProject: db.prepare("SELECT id, data FROM projects WHERE id = ?"),
  upsertProject: db.prepare(`
    INSERT INTO projects (id, data, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')
  `),
  deleteProject: db.prepare("DELETE FROM projects WHERE id = ?"),

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
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ─── API Routes ───────────────────────────────────────────────────

// List all projects (summary only — id, name, marketRef, etc.)
app.get("/api/projects", (_req, res) => {
  const rows = stmts.listProjects.all();
  const projects = rows.map((r) => {
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

// Get full project data
app.get("/api/projects/:id", (req, res) => {
  const row = stmts.getProject.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Projet introuvable" });
  res.json(JSON.parse(row.data));
});

// Save (create or update) a project
app.put("/api/projects/:id", (req, res) => {
  const project = req.body;
  if (!project || !project.id) return res.status(400).json({ error: "Données invalides" });
  stmts.upsertProject.run(project.id, JSON.stringify(project));
  res.json({ ok: true });
});

// Delete a project
app.delete("/api/projects/:id", (req, res) => {
  stmts.deleteProject.run(req.params.id);
  res.json({ ok: true });
});

// ─── Lock Routes ──────────────────────────────────────────────────

// Get all locks
app.get("/api/locks", (_req, res) => {
  const rows = stmts.getAllLocks.all();
  const locks = {};
  for (const r of rows) {
    if (!isLockStale(r.locked_at)) {
      locks[r.project_id] = { lockedBy: r.locked_by, lockedAt: r.locked_at };
    } else {
      // Clean up stale lock
      stmts.deleteLock.run(r.project_id);
    }
  }
  res.json(locks);
});

// Acquire lock
app.post("/api/locks/:projectId", (req, res) => {
  const { projectId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId requis" });

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

// Release lock
app.delete("/api/locks/:projectId", (req, res) => {
  const { userId } = req.query;
  if (userId) {
    stmts.deleteLockByUser.run(req.params.projectId, userId);
  } else {
    stmts.deleteLock.run(req.params.projectId);
  }
  res.json({ ok: true });
});

// ─── Heartbeat (keeps lock alive) ────────────────────────────────

app.post("/api/locks/:projectId/heartbeat", (req, res) => {
  const { projectId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId requis" });

  const existing = stmts.getLock.get(projectId);
  if (existing && existing.locked_by === userId) {
    stmts.upsertLock.run(projectId, userId);
    return res.json({ ok: true });
  }
  res.status(404).json({ error: "Verrou introuvable" });
});

// ─── Serve Frontend Static Files ─────────────────────────────────

app.use(express.static(STATIC_DIR));

// SPA fallback: serve index.html for all non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

// ─── Start ────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
✅ Serveur CIRAD démarré sur http://localhost:${PORT}`);
  console.log(`📁 Base de données : ${DB_PATH}`);
  console.log(`📂 Frontend servi depuis : ${STATIC_DIR}
`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
