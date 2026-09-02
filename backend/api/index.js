// Vercel serverless entry point. An Express app is itself a valid request
// handler `(req, res) => {}`, so exporting it directly here is enough —
// Vercel's Node runtime treats it like any other function handler.
// vercel.json rewrites every path to this one function, and the app's own
// routes (mounted at /api/... in app.js) do the rest of the routing.
module.exports = require('../app');
