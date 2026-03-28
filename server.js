const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const IMAGES_FILE = path.join(DATA_DIR, 'images.json');
const LOOKS_FILE = path.join(DATA_DIR, 'looks.json');

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

function saveImages() { writeJSON(IMAGES_FILE, images); }
function saveLooks() { writeJSON(LOOKS_FILE, looksData); }

// Middleware
app.use(express.json({ limit: '10mb' }));
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
