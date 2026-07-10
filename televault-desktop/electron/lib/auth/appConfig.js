const {
  embedded_supabase_url,
  embedded_supabase_anon_key,
} = require('./supabaseEmbeddedConfig');

const SUPABASE_OAUTH_CALLBACK_PATH = '/oauth2callback';
const ENTITLEMENT_FUNCTION = 'resolve-televault-access';
const CONSUME_CREDIT_FUNCTION = 'consume-televault-credit';

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || embedded_supabase_url)
    .trim()
    .replace(/\/+$/, '');
}

function getSupabaseAnonKey() {
  return String(
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || embedded_supabase_anon_key,
  ).trim();
}

function getSupabaseConfig() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    return { ok: false, error: 'Supabase chưa cấu hình.' };
  }
  return { ok: true, url, anonKey };
}

module.exports = {
  SUPABASE_OAUTH_CALLBACK_PATH,
  ENTITLEMENT_FUNCTION,
  CONSUME_CREDIT_FUNCTION,
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseConfig,
};
