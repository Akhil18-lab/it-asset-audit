const { createClient } = require('@supabase/supabase-js');

// Shared Supabase client — used by both the existing Physical Audit photo
// uploads and the newer employee self-audit links, so the bucket name and
// client setup stay in one place.
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'audit-photos';
let supabase = null;

function getSupabase() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — photo upload is unavailable');
    }
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

module.exports = { getSupabase, BUCKET };
