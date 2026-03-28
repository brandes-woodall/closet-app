const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const IMAGES_FILE = path.join(DATA_DIR, 'images.json');
const LOOKS_FILE = path.join(DATA_DIR, 'looks.json');
const STATUSES_FILE = path.join(DATA_DIR, 'statuses.json');

// Simple JSON store helpers
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

// Load data
let images = readJSON(IMAGES_FILE, {});
let looksData = readJSON(LOOKS_FILE, { nextId: 1, looks: [] });
let statuses = readJSON(STATUSES_FILE, {});

function saveImages() { writeJSON(IMAGES_FILE, images); }
function saveLooks() { writeJSON(LOOKS_FILE, looksData); }
function saveStatuses() { writeJSON(STATUSES_FILE, statuses); }

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// ===== PASSWORD PROTECTION =====
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'closet2026';
const sessions = new Set();

function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k] = v;
  });
  return cookies;
}

const LOGIN_PAGE = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Brandes Woodall</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#f5f0eb;display:flex;align-items:center;justify-content:center;min-height:100vh}
.login{background:#fff;padding:48px;border-radius:14px;border:1px solid #e0d5cc;box-shadow:0 4px 12px rgba(44,36,32,0.04);text-align:center;width:320px}
.logo{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:2px;color:#8b6f5e;margin-bottom:32px}
input{width:100%;padding:10px 14px;border:1px solid #e0d5cc;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;outline:none;margin-bottom:14px}
input:focus{border-color:#8b6f5e}
button{width:100%;padding:10px;background:#8b6f5e;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif}
button:hover{background:#725a4b}
.err{color:#a04040;font-size:12px;margin-bottom:10px}
</style></head><body><div class="login"><div class="logo">Brandes Woodall</div>
<form method="POST" action="/login">ERRSLOT<input type="password" name="password" placeholder="Password" autofocus />
<button type="submit">Enter</button></form></div></body></html>`;

app.post('/login', (req, res) => {
  if (req.body.password === SITE_PASSWORD) {
    const token = generateToken();
    sessions.add(token);
    res.setHeader('Set-Cookie', `auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
    return res.redirect('/');
  }
  res.status(401).send(LOGIN_PAGE.replace('ERRSLOT', '<div class="err">Incorrect password</div>'));
});

app.use((req, res, next) => {
  // Allow login page
  if (req.path === '/login') return next();
  const cookies = parseCookies(req);
  if (cookies.auth && sessions.has(cookies.auth)) return next();
  // Show login
  res.send(LOGIN_PAGE.replace('ERRSLOT', ''));
});

app.use(express.static(path.join(__dirname, 'public')));

// ===== IMAGE ENDPOINTS =====
app.get('/api/images', (req, res) => {
  res.json(images);
});

app.post('/api/images/:itemId', (req, res) => {
  const { imageData } = req.body;
  if (!imageData) return res.status(400).json({ error: 'No image data' });
  images[req.params.itemId] = imageData;
  saveImages();
  res.json({ ok: true });
});

app.delete('/api/images/:itemId', (req, res) => {
  delete images[req.params.itemId];
  saveImages();
  res.json({ ok: true });
});

// ===== MIGRATION ENDPOINT =====
// Remaps old sequential IDs to new stable IDs
app.post('/api/migrate-ids', (req, res) => {
  const { idMap } = req.body; // { oldId: newId, ... }
  if (!idMap || typeof idMap !== 'object') return res.status(400).json({ error: 'No idMap' });

  // Migrate images
  const newImages = {};
  for (const [key, val] of Object.entries(images)) {
    const newKey = idMap[key] || key;
    newImages[newKey] = val;
  }
  images = newImages;
  saveImages();

  // Migrate statuses
  const newStatuses = {};
  for (const [key, val] of Object.entries(statuses)) {
    const newKey = idMap[key] || key;
    newStatuses[newKey] = val;
  }
  statuses = newStatuses;
  saveStatuses();

  // Migrate looks
  for (const look of looksData.looks) {
    look.itemIds = look.itemIds.map(id => {
      const mapped = idMap[String(id)];
      return mapped ? parseInt(mapped) : id;
    });
  }
  saveLooks();

  res.json({ ok: true, migrated: Object.keys(idMap).length });
});

// ===== STATUS ENDPOINTS =====
app.get('/api/statuses', (req, res) => {
  res.json(statuses);
});

app.post('/api/statuses/:itemId', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'No status' });
  statuses[req.params.itemId] = status;
  saveStatuses();
  res.json({ ok: true });
});

// ===== LOOKS ENDPOINTS =====
app.get('/api/looks', (req, res) => {
  res.json(looksData.looks);
});

app.post('/api/looks', (req, res) => {
  const look = { id: looksData.nextId++, name: req.body.name || '', itemIds: [] };
  looksData.looks.unshift(look);
  saveLooks();
  res.json(look);
});

app.patch('/api/looks/:id', (req, res) => {
  const look = looksData.looks.find(l => l.id === parseInt(req.params.id));
  if (look) { look.name = req.body.name || ''; saveLooks(); }
  res.json({ ok: true });
});

app.delete('/api/looks/:id', (req, res) => {
  looksData.looks = looksData.looks.filter(l => l.id !== parseInt(req.params.id));
  saveLooks();
  res.json({ ok: true });
});

app.post('/api/looks/:id/items', (req, res) => {
  const look = looksData.looks.find(l => l.id === parseInt(req.params.id));
  const itemId = parseInt(req.body.itemId);
  if (look && !look.itemIds.includes(itemId)) {
    look.itemIds.push(itemId);
    saveLooks();
  }
  res.json({ ok: true });
});

app.delete('/api/looks/:id/items/:itemId', (req, res) => {
  const look = looksData.looks.find(l => l.id === parseInt(req.params.id));
  if (look) {
    look.itemIds = look.itemIds.filter(id => id !== parseInt(req.params.itemId));
    saveLooks();
  }
  res.json({ ok: true });
});

// Start
app.listen(PORT, () => {
  console.log(`Closet app running at http://localhost:${PORT}`);
});
