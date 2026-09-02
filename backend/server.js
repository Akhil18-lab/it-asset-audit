// Local development entry point only. On Vercel, api/index.js exports the
// same app as a serverless function instead — this file just adds
// app.listen() for running `npm start` on your own machine.
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
