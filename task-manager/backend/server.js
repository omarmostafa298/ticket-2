const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'taskmanager',
});

async function waitForDb(retries = 10, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Connected to database');
      return;
    } catch (err) {
      console.log(`DB not ready (attempt ${i + 1}/${retries}), retrying in ${delayMs}ms...`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw new Error('Could not connect to database after multiple attempts');
}

// Create a default admin account on first run, so there's a way in.
// Credentials are printed to the backend container logs once.
async function ensureAdminUser() {
  const existing = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing.rows.length > 0) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin') ON CONFLICT (username) DO NOTHING",
    [username, hash]
  );
  console.log('==============================================');
  console.log(`Default admin account created:`);
  console.log(`  username: ${username}`);
  console.log(`  password: ${password}`);
  console.log('Change this password after first login (see README).');
  console.log('==============================================');
}

// ---- Auth middleware ----

function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user; // { id, username, role }
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ---- Health check ----

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---- Auth routes ----

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 4) {
      return res.status(400).json({ error: 'Username and a password (min 4 chars) are required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'user') RETURNING id, username, role",
      [username.trim(), hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// ---- Ticket routes (regular users: see only their own) ----

app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

app.post('/api/tickets', authenticate, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Problem title is required' });
    }
    const result = await pool.query(
      `INSERT INTO tickets (user_id, title, description) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, title.trim(), description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Update status (done / open) — only the owner (or an admin) can update
app.put('/api/tickets/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['open', 'done'].includes(status)) {
      return res.status(400).json({ error: "status must be 'open' or 'done'" });
    }

    const existing = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    if (existing.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your ticket' });
    }

    const closedAt = status === 'done' ? new Date() : null;
    const result = await pool.query(
      'UPDATE tickets SET status = $1, closed_at = $2 WHERE id = $3 RETURNING *',
      [status, closedAt, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// ---- Admin routes ----

// Dashboard stats: total / done / open
app.get('/api/admin/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open
      FROM tickets
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Full "database view" — every ticket from every user, spreadsheet style
app.get('/api/admin/tickets', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id, u.username AS reported_by, t.title, t.description,
             t.status, t.created_at, t.closed_at
      FROM tickets t
      JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch all tickets' });
  }
});

waitForDb()
  .then(() => ensureAdminUser())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend API listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
