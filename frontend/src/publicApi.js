import axios from 'axios';

// A separate axios instance for the public, no-login self-audit pages.
// The shared `api` instance (see api.js) attaches a JWT and redirects to
// /login on any 401 — neither is appropriate here since this page is opened
// by employees who never log in at all.
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const publicApi = axios.create({ baseURL });

export default publicApi;
