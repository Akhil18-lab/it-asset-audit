const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

// Allow requests from the Vercel frontend (set FRONTEND_URL in your host's env vars)
// e.g. FRONTEND_URL=https://it-asset-audit.vercel.app
const corsOptions = {
  origin: process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:3000']
    : '*',
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// Serverless functions can get a cold, freshly-started database on any
// request, so make sure tables/seed data exist before every request instead
// of once at process start (ensureInitialized() is cheap after the first
// call on a given warm instance).
app.use((req, res, next) => {
  db.ensureInitialized().then(() => next()).catch(next);
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/physical-audit', require('./routes/physicalAudit'));
app.use('/api/cron', require('./routes/cron'));

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
