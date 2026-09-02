const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate, adminOnly, SECRET } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    SECRET,
    { expiresIn: '8h' }
  );
  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)`)
    .run(user.id, 'LOGIN', 'auth', `User ${user.username} logged in`);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
}));

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

// GET /api/auth/users  (admin only)
router.get('/users', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const users = await db.prepare('SELECT id, username, full_name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
}));

// POST /api/auth/users  (admin only)
router.post('/users', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'username, password, full_name required' });
  }
  if (!['admin', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or viewer' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)'
    ).run(username, hash, full_name, role || 'viewer');
    await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
      .run(req.user.id, 'CREATE_USER', 'user', result.lastInsertRowid, `Created user ${username}`);
    res.status(201).json({ id: result.lastInsertRowid, username, full_name, role });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    throw err;
  }
}));

// DELETE /api/auth/users/:id  (admin only)
router.delete('/users/:id', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await db.prepare('DELETE FROM users WHERE id = ?').run(id);
  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'DELETE_USER', 'user', id, `Deleted user id=${id}`);
  res.json({ success: true });
}));

module.exports = router;
