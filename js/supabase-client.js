window.sb = window.supabase || {};

const SUPABASE_URL = 'https://uzlaayqgxjaroejfrwba.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_y40sMBrFW1pWsNsZGnoadQ_QL7bxAvm';
// 暴露给页面其他脚本（如 auth.js 调 Edge Function 时附加鉴权头）
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;

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
  handleOauthRedirectBack();
});

// 处理「统一 Edge Function 服务端回调」登录后的回跳：页面 URL 携带 oauth_token/oauth_email，
// 用它 verifyOtp 换成标准会话。成功即清理 URL 参数并通知页面刷新登录态。
async function handleOauthRedirectBack() {
  try {
    const qs = new URLSearchParams(window.location.search);
    const token = qs.get('oauth_token') || '';
    const email = qs.get('oauth_email') || '';
    if (!token || !email) return;

    await ensureInitialized();
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient.auth.verifyOtp({ type: 'email', email, token });
    if (error) {
      console.warn('[Supabase] oauth verifyOtp error:', error.message);
    } else if (data && data.session) {
      await supabaseClient.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
    }

    // 清理 URL 中的 oauth_ 参数，避免刷新重复兑换 / 令牌滞留地址栏
    qs.delete('oauth_token');
    qs.delete('oauth_email');
    qs.delete('oauth_provider');
    qs.delete('oauth_user_id');
    const q = qs.toString();
    const clean = window.location.pathname + (q ? '?' + q : '') + window.location.hash;
    window.history.replaceState({}, '', clean);

    // 通知页面刷新登录态
    window.dispatchEvent(new CustomEvent('myzone-oauth-settled'));
  } catch (err) {
    console.warn('[Supabase] handleOauthRedirectBack exception:', err);
  }
}