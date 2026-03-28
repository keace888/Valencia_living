'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Storage setup ──────────────────────────────────────────────────────────
// DATA_DIR defaults to ./data locally; on Render set DATA_DIR=/data (persistent disk)
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const LEADS_CSV = path.join(DATA_DIR, 'leads.csv');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Write CSV header if file doesn't exist yet
if (!fs.existsSync(LEADS_CSV)) {
  fs.writeFileSync(LEADS_CSV, 'id,first_name,last_name,email,phone,community,timeline,created_at\n');
}

let leadIdCounter = (() => {
  const lines = fs.readFileSync(LEADS_CSV, 'utf8').trim().split('\n');
  return lines.length; // header counts as 1, so first lead = id 1
})();

function saveLead(data) {
  leadIdCounter++;
  const id = leadIdCounter;
  const ts = new Date().toISOString();
  const row = [
    id,
    csvEscape(data.firstName),
    csvEscape(data.lastName),
    csvEscape(data.email),
    csvEscape(data.phone || ''),
    csvEscape(data.community || ''),
    csvEscape(data.timeline || ''),
    ts,
  ].join(',') + '\n';
  fs.appendFileSync(LEADS_CSV, row);
  return id;
}

function readLeads() {
  const lines = fs.readFileSync(LEADS_CSV, 'utf8').trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

function csvEscape(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/contact — save a lead
app.post('/api/contact', (req, res) => {
  const { firstName, lastName, email, phone, community, timeline } = req.body;

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const id = saveLead({
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      email:     email.trim().toLowerCase(),
      phone:     phone?.trim(),
      community,
      timeline,
    });
    console.log(`[lead #${id}] ${firstName.trim()} ${lastName.trim()} <${email.trim()}>`);
    res.json({ success: true });
  } catch (err) {
    console.error('[storage error]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/leads — view all leads (protected by ADMIN_KEY header)
app.get('/api/leads', (req, res) => {
  const key = req.headers['x-api-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const leads = readLeads();
    res.json({ count: leads.length, leads });
  } catch (err) {
    res.status(500).json({ error: 'Could not read leads.' });
  }
});

// GET /api/leads/download — download CSV directly
app.get('/api/leads/download', (req, res) => {
  const key = req.headers['x-api-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.setHeader('Content-Disposition', 'attachment; filename="valencia-leads.csv"');
  res.setHeader('Content-Type', 'text/csv');
  res.sendFile(LEADS_CSV);
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Valencia server running → http://localhost:${PORT}`);
});
