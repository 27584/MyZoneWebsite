window.sb = window.supabase || {};

const SUPABASE_URL = 'https://uzlaayqgxjaroejfrwba.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_y40sMBrFW1pWsNsZGnoadQ_QL7bxAvm';

let supabaseClient = null;
let isConfigured = false;

function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /^https?:\/\//.test(trimmed);
}

function validateKey(key) {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed.startsWith('sb_publishable_') || 
         trimmed.startsWith('ey');
}

function initializeSupabase() {
  try {
    if (!validateUrl(SUPABASE_URL) || !validateKey(SUPABASE_PUBLISHABLE_KEY)) {
      console.warn('[Supabase] Invalid URL or key');
      return;
    }

    if (typeof window.supabase.createClient !== 'function') {
      console.error('[Supabase] createClient is not available in window.supabase');
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    isConfigured = true;
    console.log('[Supabase] Client initialized successfully');
  } catch (error) {
    console.error('[Supabase] Failed to initialize:', error);
    supabaseClient = null;
    isConfigured = false;
  }
}

async function ensureInitialized() {
  if (!isConfigured && !supabaseClient) {
    initializeSupabase();
  }
  return isConfigured;
}

window.appSupabase = {
  get client() {
    return supabaseClient;
  },
  get isConfigured() {
    return isConfigured;
  },
  ensureInitialized: ensureInitialized
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Supabase] DOMContentLoaded, initializing...');
  initializeSupabase();
});