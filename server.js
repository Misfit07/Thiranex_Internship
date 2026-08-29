// server.js — Express + SQLite backend for the portfolio site
const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "portfolio.db"));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Database setup ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT, tagline TEXT, bio TEXT,
    email TEXT, github TEXT, linkedin TEXT
  );
  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, category TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, description TEXT,
    tech TEXT, repo_url TEXT, live_url TEXT,
    featured INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed with demo data only the first time the DB is created
if (!db.prepare("SELECT id FROM profile WHERE id = 1").get()) {
  db.prepare(`INSERT INTO profile (id, name, tagline, bio, email, github, linkedin)
    VALUES (1, ?, ?, ?, ?, ?, ?)`).run(
    "Your Name",
    "Full-Stack Developer",
    "I build clean, fast web apps end to end — from database schema to pixel-perfect UI. Currently exploring distributed systems and developer tooling.",
    "you@example.com",
    "https://github.com/yourhandle",
    "https://linkedin.com/in/yourhandle"
  );

  const skill = db.prepare("INSERT INTO skills (name, category) VALUES (?, ?)");
  [
    ["JavaScript", "Language"], ["Python", "Language"], ["SQL", "Language"],
    ["React", "Frontend"], ["HTML/CSS", "Frontend"],
    ["Node.js", "Backend"], ["Express", "Backend"], ["Django", "Backend"],
    ["PostgreSQL", "Database"], ["MongoDB", "Database"], ["SQLite", "Database"],
    ["Git", "Tools"], ["Docker", "Tools"], ["Vercel", "Tools"],
  ].forEach((s) => skill.run(...s));

  const project = db.prepare(`INSERT INTO projects
    (title, description, tech, repo_url, live_url, featured) VALUES (?, ?, ?, ?, ?, ?)`);
  project.run(
    "Personal Portfolio API",
    "This very site — a full-stack portfolio with an Express backend, SQLite database, and a vanilla JS frontend that reads live data from the API.",
    "Express, SQLite, JavaScript",
    "https://github.com/yourhandle/portfolio",
    "",
    1
  );
  project.run(
    "Task Tracker",
    "A REST API for managing tasks with auth, filtering, and due-date reminders.",
    "Node.js, Express, PostgreSQL",
    "https://github.com/yourhandle/task-tracker",
    "",
    1
  );
  project.run(
    "Weather Dashboard",
    "A React dashboard that visualizes 7-day forecasts pulled from a public weather API.",
    "React, Chart.js, REST API",
    "https://github.com/yourhandle/weather-dashboard",
    "",
    0
  );
}

// ---------- API routes ----------
app.get("/api/profile", (req, res) => {
  res.json(db.prepare("SELECT * FROM profile WHERE id = 1").get());
});

app.get("/api/skills", (req, res) => {
  res.json(db.prepare("SELECT * FROM skills ORDER BY category, name").all());
});

app.get("/api/projects", (req, res) => {
  res.json(db.prepare("SELECT * FROM projects ORDER BY featured DESC, id DESC").all());
});

app.post("/api/projects", (req, res) => {
  const { title, description, tech, repo_url, live_url, featured } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const info = db.prepare(`INSERT INTO projects (title, description, tech, repo_url, live_url, featured)
    VALUES (?, ?, ?, ?, ?, ?)`).run(title, description || "", tech || "", repo_url || "", live_url || "", featured ? 1 : 0);
  res.status(201).json(db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid));
});

app.delete("/api/projects/:id", (req, res) => {
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

app.post("/api/messages", (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: "name, email and message are required" });
  db.prepare("INSERT INTO messages (name, email, message) VALUES (?, ?, ?)").run(name, email, message);
  res.status(201).json({ ok: true });
});

app.listen(PORT, () => console.log(`Portfolio server running at http://localhost:${PORT}`));
