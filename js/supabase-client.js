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

// 供 MyZone 内置浏览器注入：同步语言/主题/登录态。
// 客户端仅在官方站点页面触发本事件，避免把会话泄漏到任意网页。
window.addEventListener('myzone-settings', async (e) => {
  const detail = (e && e.detail) || {};

  if (detail.lang && window.i18n && typeof window.i18n.setLang === 'function') {
    window.i18n.setLang(detail.lang);
  }

  if (detail.theme === 'light' || detail.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', detail.theme);
    localStorage.setItem('myzone-theme', detail.theme);
    if (typeof updateThemeIcons === 'function') updateThemeIcons(detail.theme);
  }

  const auth = detail.auth;
  if (auth && auth.accessToken) {
    await ensureInitialized();
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.auth.setSession({
        access_token: auth.accessToken,
        refresh_token: auth.refreshToken || ''
      });
      if (error) console.warn('[Supabase] myzone setSession error:', error.message);
    } catch (err) {
      console.error('[Supabase] myzone setSession exception:', err);
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Supabase] DOMContentLoaded, initializing...');
  initializeSupabase();
});