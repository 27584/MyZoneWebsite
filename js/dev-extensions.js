// ========== 开发者扩展管理（仅操作自己的扩展） ==========
//
// 复用管理员后台的扩展管理交互模式，但通过 dev_* RPC 限定为：
//  - 只能查看 / 编辑 / 删除自己的扩展（developer = 当前用户）
//  - 每次变更（创建 / 修改信息 / 上传版本）都会插入一条待审核记录，
//    审核结果由管理员通过系统消息通知开发者
//  - 扩展云数据已合并到扩展详情中（global 数据 + 本人 user 数据）

const extensionsListEl = document.getElementById('extensionsList');
const addExtensionBtn = document.getElementById('addExtensionBtn');
const editExtensionForm = document.getElementById('editExtensionForm');
const editExtensionModal = document.getElementById('editExtensionModal');
const editExtensionError = document.getElementById('editExtensionError');
const extensionDetailModal = document.getElementById('extensionDetailModal');
const addVersionForm = document.getElementById('addVersionForm');

let currentDetailExtensionId = null;
let currentExtensions = []; // dev_list_extensions 的缓存，供编辑时回填
let currentDetailCloudData = []; // 当前扩展的云数据（详情弹窗内展示）

// 以 iframe 嵌入（例如 dashboard 的「扩展管理」页）时，隐藏本页自身的导航栏与侧边栏，
// 只保留内容区，避免与宿主页面重复嵌套。
if (window.self !== window.top) {
  document.body.classList.add('embedded');
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showLoading(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <i data-lucide="loader-2" class="animate-spin"></i>
      </div>
      <p>${i18n.t('common.loading')}</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function showErrorState(container, message) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <i data-lucide="x-circle"></i>
      </div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function getCurrentUser() {
  const initialized = await appSupabase.ensureInitialized();
  if (!initialized) return null;
  const { data } = await appSupabase.client.auth.getSession();
  return data.session?.user || null;
}

function devLocale() {
  return i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US';
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString(devLocale());
}

// ========== 图标 / ZIP / 清单解析辅助（与 admin.js 对齐） ==========

async function resolveAdminIconUrl(iconUrl) {
  if (!iconUrl) return null;
  if (/^(https?:|data:|file:)/.test(iconUrl)) return iconUrl;
  try {
    const { data, error } = await appSupabase.client.storage
      .from('extension-files')
      .createSignedUrl(iconUrl, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (e) {
    console.warn('[Dev] Failed to resolve icon URL:', iconUrl, e);
    return null;
  }
}

async function calculateChecksum(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function readZipEntryData(bytes, dataOffset, compressionMethod, compressedSize, uncompressedSize) {
  if (compressionMethod === 0) {
    return bytes.subarray(dataOffset, dataOffset + uncompressedSize);
  } else if (compressionMethod === 8) {
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    let totalLen = 0;
    let readResult;
    while (!(readResult = await reader.read()).done) {
      chunks.push(readResult.value);
      totalLen += readResult.value.length;
    }
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }
  throw new Error(`Unsupported compression method: ${compressionMethod}`);
}

const DEV_MSG_PLACEHOLDER_REGEX = /__MSG_([\w.]+)__/g;

function resolveLocaleKey(table, key) {
  const parts = key.split('.');
  let current = table;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  if (current && typeof current === 'object' && 'message' in current) {
    return current.message;
  }
  return typeof current === 'string' ? current : undefined;
}

function resolveMsgPlaceholders(value, locales, langList) {
  if (typeof value !== 'string' || !value.includes('__MSG_')) return value;
  return value.replace(DEV_MSG_PLACEHOLDER_REGEX, (match, key) => {
    for (const lang of langList) {
      const table = locales[lang];
      if (!table) continue;
      const val = resolveLocaleKey(table, key);
      if (val !== undefined) return val;
    }
    return match;
  });
}

function resolveManifestI18n(manifest, locales) {
  const defaultLang = manifest.default_locale || null;
  const adminLang = (typeof i18n !== 'undefined' && i18n.currentLang) ? i18n.currentLang() : 'zh';
  const langList = [];
  if (adminLang && !langList.includes(adminLang)) langList.push(adminLang);
  if (defaultLang && !langList.includes(defaultLang)) langList.push(defaultLang);
  if (!langList.includes('zh')) langList.push('zh');
  if (!langList.includes('en')) langList.push('en');
  for (const l of Object.keys(locales)) {
    if (!langList.includes(l)) langList.push(l);
  }
  return {
    name: resolveMsgPlaceholders(manifest.name, locales, langList),
    description: resolveMsgPlaceholders(manifest.description, locales, langList),
  };
}

async function parseManifestFromZip(zipBuffer) {
  const view = new DataView(zipBuffer);
  const bytes = new Uint8Array(zipBuffer);
  let offset = 0;
  const LOCAL_FILE_HEADER_SIG = 0x04034b50;
  const UTF8_DEC = new TextDecoder('utf-8');

  let manifest = null;
  let manifestFileName = null;
  const locales = {};
  const entries = new Map();

  while (offset < zipBuffer.byteLength - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== LOCAL_FILE_HEADER_SIG) break;

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);
    const fileName = UTF8_DEC.decode(bytes.subarray(offset + 30, offset + 30 + fileNameLength));
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    const isDirectory = fileName.endsWith('/');
    offset = dataOffset + compressedSize;
    if (isDirectory) continue;

    const normalized = fileName.replace(/\\/g, '/');
    const segments = normalized.split('/');
    const baseName = segments.pop();
    const depth = segments.length;

    entries.set(normalized, { dataOffset, compressionMethod, compressedSize, uncompressedSize });

    if (manifest === null && baseName.toLowerCase() === 'manifest.json' && depth <= 1) {
      const fileBytes = await readZipEntryData(bytes, dataOffset, compressionMethod, compressedSize, uncompressedSize);
      manifest = JSON.parse(UTF8_DEC.decode(fileBytes));
      manifestFileName = normalized;
      continue;
    }

    if (baseName.toLowerCase() === 'messages.json') {
      const localesIdx = segments.findIndex(s => s === '_locales');
      if (localesIdx >= 0 && segments.length >= localesIdx + 2) {
        const lang = segments[localesIdx + 1];
        try {
          const fileBytes = await readZipEntryData(bytes, dataOffset, compressionMethod, compressedSize, uncompressedSize);
          locales[lang] = JSON.parse(UTF8_DEC.decode(fileBytes));
        } catch (e) {
          console.warn('[Dev] Failed to parse locale', lang, e);
        }
      }
    }
  }

  if (!manifest) return null;
  const readEntry = async (path) => {
    const key = String(path).replace(/\\/g, '/');
    const entry = entries.get(key);
    if (!entry) return null;
    return readZipEntryData(bytes, entry.dataOffset, entry.compressionMethod, entry.compressedSize, entry.uncompressedSize);
  };
  return { manifest, locales, fileName: manifestFileName, readEntry };
}

// ========== 快捷创建（复用 admin 的 ZIP→manifest 流程，走 dev_* RPC） ==========

// 选择 manifest 中要使用的图标路径
// 优先级：icons（最大尺寸） > action.default_icon > browser_action.default_icon > page_action.default_icon
function getManifestIconPath(manifest) {
  const candidates = [
    manifest.icons,
    manifest.action && manifest.action.default_icon,
    manifest.browser_action && manifest.browser_action.default_icon,
    manifest.page_action && manifest.page_action.default_icon,
  ];
  for (const icons of candidates) {
    if (!icons) continue;
    if (typeof icons === 'string') return icons;
    if (typeof icons === 'object') {
      const sizes = Object.keys(icons).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
      if (sizes.length > 0) return icons[String(sizes[0])];
      const keys = Object.keys(icons);
      if (keys.length > 0) return icons[keys[0]];
    }
  }
  return null;
}

function getMimeType(fileName) {
  const ext = String(fileName).split('.').pop().toLowerCase();
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
    bmp: 'image/bmp', avif: 'image/avif'
  };
  return map[ext] || 'application/octet-stream';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function resolveEntryPath(baseDir, relPath) {
  const parts = String(relPath).replace(/\\/g, '/').split('/').filter(Boolean);
  if (baseDir) {
    return baseDir.split('/').filter(Boolean).concat(parts).join('/');
  }
  return parts.join('/');
}

function isUrlIcon(path) {
  return /^https?:\/\//i.test(String(path || ''));
}

const MAX_ICON_BYTES = 1 * 1024 * 1024; // 1MB

async function extractManifestIcon(manifest, result) {
  if (!result || typeof result.readEntry !== 'function') return { iconData: null, error: null };
  const iconPath = getManifestIconPath(manifest);
  if (!iconPath) return { iconData: null, error: null };

  if (isUrlIcon(iconPath)) {
    return { iconData: null, error: null, isUrl: true, iconUrl: iconPath };
  }

  const baseDir = result.fileName ? result.fileName.split('/').slice(0, -1).join('/') : '';
  const fullPath = resolveEntryPath(baseDir, iconPath);
  const bytes = await result.readEntry(fullPath);
  if (!bytes || bytes.length === 0) {
    return { iconData: null, error: `未在 ZIP 中找到图标文件：${iconPath}` };
  }
  if (bytes.length > MAX_ICON_BYTES) {
    return { iconData: null, error: `图标文件过大：${iconPath} (${(bytes.length / 1024).toFixed(0)}KB，上限 ${(MAX_ICON_BYTES / 1024).toFixed(0)}KB)` };
  }
  const mime = getMimeType(iconPath);
  const filename = iconPath.split('/').pop();
  return { iconData: { bytes, mime, filename }, error: null, isUrl: false };
}

async function uploadIconToStorage(iconData, extensionId) {
  if (!iconData || !iconData.bytes || !iconData.mime || !iconData.filename) return null;

  const filePath = `extensions/${extensionId}/icons/${iconData.filename}`;
  const uploadUrl = `${appSupabase.client.supabaseUrl}/storage/v1/object/extension-files/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
  const { data: sessionData } = await appSupabase.client.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    console.warn('[Dev] No access token, cannot upload icon');
    return null;
  }

  const bytesCopy = new Uint8Array(iconData.bytes);
  const buffer = bytesCopy.buffer;

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', appSupabase.client.supabaseKey);
    xhr.setRequestHeader('Content-Type', iconData.mime);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || ''}`));
    };
    xhr.onerror = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
    xhr.onabort = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
    xhr.send(buffer);
  });

  return filePath;
}

async function buildManifestExtInfo(manifest, locales, result) {
  const i18nResolved = resolveManifestI18n(manifest, locales);
  const enName = resolveMsgPlaceholders(manifest.name, locales, ['en']);
  const enDesc = resolveMsgPlaceholders(manifest.description, locales, ['en']);

  let iconData = null;
  let iconError = null;
  let iconPreviewUrl = null;
  let iconUrl = null;
  try {
    const iconResult = await extractManifestIcon(manifest, result);
    iconData = iconResult.iconData;
    iconError = iconResult.error;
    if (iconResult.isUrl && iconResult.iconUrl) {
      iconUrl = iconResult.iconUrl;
      iconPreviewUrl = iconResult.iconUrl;
    } else if (iconData) {
      const base64 = bytesToBase64(iconData.bytes);
      iconPreviewUrl = `data:${iconData.mime};base64,${base64}`;
    }
  } catch (e) {
    console.warn('[Dev] Extract icon failed:', e);
    iconError = e.message;
  }

  return {
    name: i18nResolved.name || manifest.name || '',
    nameEn: (enName && enName !== i18nResolved.name) ? enName : '',
    description: i18nResolved.description || '',
    descriptionEn: (enDesc && enDesc !== i18nResolved.description) ? enDesc : '',
    author: manifest.author || '',
    slug: manifest.slug || '',
    website: manifest.homepage_url || '',
    tags: manifest.tags || [],
    iconData,
    iconPreviewUrl,
    iconUrl,
    iconError,
  };
}

// ========== 快捷创建弹窗 ==========

let quickCreateExtInfo = null;

function openQuickCreateModal() {
  quickCreateExtInfo = null;
  document.getElementById('quickCreateForm').reset();
  document.getElementById('quickCreateSummary').classList.add('hidden');
  document.getElementById('quickCreateError').classList.add('hidden');
  document.getElementById('quickCreateSubmitBtn').disabled = true;
  const statusEl = document.getElementById('quickCreateParseStatus');
  statusEl.classList.add('hidden');
  statusEl.classList.remove('parsing', 'success', 'error');
  statusEl.textContent = '';
  const progressWrap = document.getElementById('quickCreateProgress');
  progressWrap.classList.add('hidden');
  document.getElementById('quickCreateIconGroup').style.display = 'none';
  document.getElementById('quickCreateIconPreview').removeAttribute('src');
  const modal = document.getElementById('quickCreateModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeQuickCreateModal() {
  const modal = document.getElementById('quickCreateModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function handleQuickCreateFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('quickCreateParseStatus');
  const errorEl = document.getElementById('quickCreateError');
  errorEl.classList.add('hidden');

  statusEl.classList.remove('hidden', 'success', 'error');
  statusEl.classList.add('parsing');
  statusEl.textContent = i18n.t('admin.manifestParsing') || '正在解析 manifest.json...';

  try {
    const buffer = await file.arrayBuffer();
    const result = await parseManifestFromZip(buffer);

    if (!result) {
      statusEl.classList.remove('parsing', 'success');
      statusEl.classList.add('error');
      statusEl.textContent = i18n.t('admin.manifestNotFound') || '未在 ZIP 中找到 manifest.json';
      return;
    }

    const manifest = result.manifest;
    const locales = result.locales || {};

    const extInfo = await buildManifestExtInfo(manifest, locales, result);
    quickCreateExtInfo = extInfo;

    document.getElementById('quickCreateSlug').value = extInfo.slug || '';
    document.getElementById('quickCreateName').value = extInfo.name || '';
    document.getElementById('quickCreateDesc').value = extInfo.description || '';
    document.getElementById('quickCreateNameEn').value = extInfo.nameEn || '';
    document.getElementById('quickCreateDescEn').value = extInfo.descriptionEn || '';
    document.getElementById('quickCreateAuthor').value = extInfo.author || '';
    document.getElementById('quickCreateWebsite').value = extInfo.website || '';
    document.getElementById('quickCreateTags').value = (extInfo.tags || []).join(', ');
    document.getElementById('quickCreateVersion').value = manifest.version || '';
    document.getElementById('quickCreateMinApp').value = manifest.min_app_version || '';
    document.getElementById('quickCreateMinAppCode').value = manifest.min_app_version_code || '';

    const iconGroup = document.getElementById('quickCreateIconGroup');
    const iconPreview = document.getElementById('quickCreateIconPreview');
    const iconFallback = document.getElementById('quickCreateIconFallback');
    if (extInfo.iconPreviewUrl) {
      iconGroup.style.display = '';
      iconPreview.style.display = '';
      iconPreview.src = extInfo.iconPreviewUrl;
      iconFallback.style.display = 'none';
    } else if (extInfo.iconError) {
      iconGroup.style.display = '';
      iconPreview.style.display = 'none';
      iconFallback.style.display = '';
      iconFallback.textContent = i18n.t('admin.extIcon') + ' ⚠ ' + extInfo.iconError;
    } else {
      iconGroup.style.display = 'none';
    }

    statusEl.classList.remove('parsing', 'error');
    statusEl.classList.add('success');
    const displayName = extInfo.name || manifest.name || '';
    const namePart = displayName ? `${displayName} ` : '';
    const verPart = manifest.version ? `v${manifest.version} ` : '';
    statusEl.textContent = `${i18n.t('admin.manifestParsed') || '已解析 manifest'}：${namePart}${verPart}(${result.fileName})`;

    document.getElementById('quickCreateSummary').classList.remove('hidden');
    document.getElementById('quickCreateSubmitBtn').disabled = false;
  } catch (err) {
    console.error('Quick create parse error:', err);
    statusEl.classList.remove('parsing', 'success');
    statusEl.classList.add('error');
    statusEl.textContent = (i18n.t('admin.manifestParseFailed') || '解析 manifest 失败') + ': ' + err.message;
    document.getElementById('quickCreateSummary').classList.add('hidden');
    document.getElementById('quickCreateSubmitBtn').disabled = true;
  }
}

async function quickCreateSubmit(e) {
  e.preventDefault();

  const fileInput = document.getElementById('quickCreateFile');
  const versionFile = fileInput.files[0];
  if (!versionFile) return;

  const slug = document.getElementById('quickCreateSlug').value.trim();
  const name = document.getElementById('quickCreateName').value.trim();
  const description = document.getElementById('quickCreateDesc').value.trim();
  const nameEn = document.getElementById('quickCreateNameEn').value.trim();
  const descriptionEn = document.getElementById('quickCreateDescEn').value.trim();
  const author = document.getElementById('quickCreateAuthor').value.trim();
  const website = document.getElementById('quickCreateWebsite').value.trim();
  const tagsStr = document.getElementById('quickCreateTags').value.trim();
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
  const iconData = quickCreateExtInfo?.iconData || null;

  const versionNumber = document.getElementById('quickCreateVersion').value.trim();
  const changelog = document.getElementById('quickCreateChangelog').value.trim();
  const minAppVersion = document.getElementById('quickCreateMinApp').value.trim();
  const minAppCodeRaw = document.getElementById('quickCreateMinAppCode').value.trim();
  const minAppVersionCode = minAppCodeRaw ? parseInt(minAppCodeRaw, 10) : null;

  const errorEl = document.getElementById('quickCreateError');
  const submitBtn = document.getElementById('quickCreateSubmitBtn');
  const progressWrap = document.getElementById('quickCreateProgress');
  const progressFill = document.getElementById('quickCreateProgressFill');
  const progressPercent = document.getElementById('quickCreateProgressPercent');
  const progressStage = document.getElementById('quickCreateProgressStage');
  errorEl.classList.add('hidden');

  const setProgress = (percent, stageKey, fallback) => {
    const clamped = Math.max(0, Math.min(100, percent));
    progressFill.style.width = clamped + '%';
    progressPercent.textContent = Math.round(clamped) + '%';
    if (stageKey) progressStage.textContent = i18n.t(stageKey) || fallback;
  };

  progressWrap.classList.remove('hidden');
  setProgress(0, 'admin.stagePreparing', '准备中...');
  submitBtn.disabled = true;
  submitBtn.classList.add('disabled');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = i18n.t('admin.uploading') || '上传中...';

  try {
    // 阶段 1：创建扩展（0% - 12%）
    setProgress(5, 'admin.stageCreatingExtension', '正在创建扩展...');
    const createResult = await appSupabase.client.rpc('dev_create_extension', {
      p_slug: slug,
      p_name: name,
      p_description: description,
      p_name_en: nameEn || null,
      p_description_en: descriptionEn || null,
      p_author: author,
      p_icon_url: null,
      p_website: website,
      p_tags: tags
    });

    if (createResult.error) {
      throw new Error(createResult.error.message || (i18n.t('admin.createFailed') || '创建扩展失败'));
    }
    const createData = createResult.data;
    if (createData && createData.success === false) {
      throw new Error(createData.message || (i18n.t('admin.createFailed') || '创建扩展失败'));
    }

    const extensionId = createData?.extension_id;
    if (!extensionId) {
      throw new Error(i18n.t('admin.createFailed') || '创建扩展失败：未获取到扩展ID');
    }

    // 阶段 1.5：处理图标（12% - 18%）
    let iconStoragePath = null;
    if (iconData) {
      setProgress(13, '', '正在上传图标...');
      try {
        iconStoragePath = await uploadIconToStorage(iconData, extensionId);
        if (iconStoragePath) {
          await appSupabase.client.rpc('dev_update_extension', {
            p_extension_id: extensionId,
            p_name: null, p_description: null, p_name_en: null,
            p_description_en: null, p_author: null, p_icon_url: iconStoragePath,
            p_website: null, p_tags: null
          });
        }
      } catch (iconErr) {
        console.warn('[Dev] Icon upload failed, continuing without icon:', iconErr);
      }
    } else if (quickCreateExtInfo?.iconUrl) {
      setProgress(13, '', '正在保存图标地址...');
      try {
        await appSupabase.client.rpc('dev_update_extension', {
          p_extension_id: extensionId,
          p_name: null, p_description: null, p_name_en: null,
          p_description_en: null, p_author: null, p_icon_url: quickCreateExtInfo.iconUrl,
          p_website: null, p_tags: null
        });
      } catch (iconErr) {
        console.warn('[Dev] Icon URL save failed:', iconErr);
      }
    }
    setProgress(18, 'admin.stageReadingFile', '正在读取文件...');

    // 阶段 2：上传文件（18% - 85%）
    const fileBuffer = await versionFile.arrayBuffer();
    const fileSize = versionFile.size;
    setProgress(18, 'admin.stageChecksum', '正在计算校验和...');
    const fileChecksum = await calculateChecksum(fileBuffer);
    setProgress(22, 'admin.stageUploading', '正在上传文件...');
    const filePath = `extensions/${extensionId}/${versionNumber}/${versionFile.name}`;

    const uploadUrl = `${appSupabase.client.supabaseUrl}/storage/v1/object/extension-files/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
    const { data: sessionData } = await appSupabase.client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('apikey', appSupabase.client.supabaseKey);
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.setRequestHeader('x-upsert', 'true');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const uploadRatio = ev.loaded / ev.total;
          const overall = 22 + uploadRatio * 63;
          setProgress(overall, 'admin.stageUploading', '正在上传文件...');
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(85, 'admin.stageCreatingVersion', '正在创建版本记录...');
          resolve();
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.message) msg = resp.message;
            else if (resp.error) msg = resp.error;
          } catch (_) {}
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
      xhr.onabort = () => reject(new Error('Upload aborted'));
      xhr.send(fileBuffer);
    });

    // 阶段 3：创建版本记录（85% - 100%）
    const { data: versionResult, error: versionError } = await appSupabase.client.rpc('dev_create_extension_version', {
      p_extension_id: extensionId,
      p_version_number: versionNumber,
      p_changelog: changelog,
      p_file_path: filePath,
      p_file_size: fileSize,
      p_checksum: fileChecksum,
      p_min_app_version: minAppVersion,
      p_min_app_version_code: minAppVersionCode
    });

    if (versionError) throw versionError;
    if (versionResult && versionResult.success === false) {
      throw new Error(versionResult.message);
    }

    setProgress(100, 'admin.stageDone', '完成');
    closeQuickCreateModal();
    loadExtensions();
    alert(i18n.t('dev.devVersionSubmitted') || '版本已提交，待管理员审核');
  } catch (error) {
    console.error('Quick create error:', error);
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');
    submitBtn.textContent = originalBtnText;
    setTimeout(() => {
      progressWrap.classList.add('hidden');
      setProgress(0, '', '');
    }, 800);
  }
}

// ========== 扩展列表 ==========

async function loadExtensions() {
  const user = await getCurrentUser();
  if (!user) {
    showErrorState(extensionsListEl, i18n.t('common.loginFirst'));
    return;
  }

  showLoading(extensionsListEl);
  try {
    const { data, error } = await appSupabase.client.rpc('dev_list_extensions');
    if (error) {
      console.error('Load dev extensions error:', error);
      showErrorState(extensionsListEl, error.message || i18n.t('common.error'));
      return;
    }

    currentExtensions = data || [];
    if (currentExtensions.length === 0) {
      extensionsListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <i data-lucide="sliders"></i>
          </div>
          <p>${i18n.t('dev.devNoExtensions') || '您还没有扩展'}</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const resolvedIcons = await Promise.all(
      currentExtensions.map(ext => resolveAdminIconUrl(ext.icon_url))
    );

    extensionsListEl.innerHTML = currentExtensions.map((ext, idx) => {
      const iconHtml = resolvedIcons[idx]
        ? `<img class="ext-card-icon" src="${resolvedIcons[idx]}" alt="" onerror="this.style.display='none'">`
        : '';
      const published = ext.is_published
        ? `<span style="color:#22c55e">● ${i18n.t('dev.devPublished') || '已上架'}</span>`
        : `<span style="color:#a1a1aa">● ${i18n.t('dev.devUnpublished') || '未上架'}</span>`;
      const pendingEdit = ext.pending_review && ext.pending_review.review_type === 'update';
      const pendingBadge = ext.pending_review
        ? `<span class="pro-badge">${pendingEdit
            ? (i18n.t('dev.devPendingEdit') || '信息修改待审核')
            : (i18n.t('dev.devPending') || '待审核')}</span>`
        : '';
      const editBtn = pendingEdit
        ? `<button class="action-btn" disabled title="${i18n.t('dev.devPendingEditTip') || '已有待审核的信息修改，请等待审核结果'}">${i18n.t('admin.edit') || '编辑'}</button>`
        : `<button class="action-btn edit" onclick="editExtension('${ext.extension_id}')">${i18n.t('admin.edit') || '编辑'}</button>`;
      return `
        <div class="code-card">
          <div class="code-info">
            <div class="code-code">${iconHtml}${escapeHtml(ext.name)}${escapeHtml(ext.name_en) ? ' / ' + escapeHtml(ext.name_en) : ''}${pendingBadge}</div>
            <div class="code-details">
              <p>${i18n.t('admin.identifier') || '标识'}: ${escapeHtml(ext.slug)} ${published}</p>
              <p>${escapeHtml(ext.description || i18n.t('admin.noDescription') || '无描述')}</p>
              <p>${i18n.t('admin.latestVersion') || '最新版本'}: ${ext.latest_version || (i18n.t('admin.noVersion') || '无版本')} · ${i18n.t('admin.downloads') || '下载'}: ${ext.download_count || 0}</p>
            </div>
          </div>
          <div class="code-actions">
            <button class="action-btn" onclick="viewExtensionDetail('${ext.extension_id}')">${i18n.t('admin.viewDetail') || '详情'}</button>
            ${editBtn}
            <button class="action-btn ${ext.is_published ? 'delete' : 'primary'}" onclick="toggleDevPublish('${ext.extension_id}', ${ext.is_published ? 'false' : 'true'})">
              ${ext.is_published ? (i18n.t('admin.unpublish') || '取消发布') : (i18n.t('admin.publish') || '发布')}
            </button>
            <button class="action-btn delete" onclick="deleteExtension('${ext.extension_id}')">${i18n.t('admin.delete') || '删除'}</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load dev extensions error:', error);
    showErrorState(extensionsListEl, error.message || i18n.t('common.networkError'));
  }
}

function openAddExtensionModal() {
  editExtensionModal.classList.remove('hidden');
  editExtensionModal.classList.add('active');
  editExtensionError.classList.add('hidden');
  document.getElementById('editExtensionTitle').textContent = i18n.t('dev.devCreate') || '创建扩展';
  document.getElementById('editExtensionId').value = '';
  editExtensionForm.reset();
  const preview = document.getElementById('editExtIconPreview');
  preview.style.display = 'none';
  preview.removeAttribute('src');
}

function closeEditExtensionModal() {
  editExtensionModal.classList.remove('active');
  setTimeout(() => editExtensionModal.classList.add('hidden'), 200);
}

function editExtension(extId) {
  const ext = currentExtensions.find(e => e.extension_id === extId);
  if (!ext) return;
  editExtensionModal.classList.remove('hidden');
  editExtensionModal.classList.add('active');
  editExtensionError.classList.add('hidden');
  document.getElementById('editExtensionTitle').textContent = i18n.t('admin.editExtension') || '编辑扩展';
  document.getElementById('editExtensionId').value = ext.extension_id;
  document.getElementById('editExtSlug').value = ext.slug;
  document.getElementById('editExtSlug').readOnly = true;
  document.getElementById('editExtName').value = ext.name || '';
  document.getElementById('editExtDesc').value = ext.description || '';
  document.getElementById('editExtNameEn').value = ext.name_en || '';
  document.getElementById('editExtDescEn').value = ext.description_en || '';
  document.getElementById('editExtAuthor').value = ext.author || '';
  document.getElementById('editExtIcon').value = ext.icon_url || '';
  document.getElementById('editExtWebsite').value = ext.website || '';
  document.getElementById('editExtTags').value = (ext.tags || []).join(', ');
  refreshIconPreview(ext.icon_url);
}

async function refreshIconPreview(value) {
  const preview = document.getElementById('editExtIconPreview');
  if (!preview) return;
  if (!value) {
    preview.style.display = 'none';
    preview.removeAttribute('src');
    return;
  }
  const resolved = await resolveAdminIconUrl(value);
  if (resolved) {
    preview.src = resolved;
    preview.style.display = '';
  } else {
    preview.style.display = 'none';
  }
}

async function saveExtension(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  if (!user) return;

  editExtensionError.classList.add('hidden');
  const extId = document.getElementById('editExtensionId').value;
  const slug = document.getElementById('editExtSlug').value.trim();
  const name = document.getElementById('editExtName').value.trim();
  const description = document.getElementById('editExtDesc').value.trim();
  const nameEn = document.getElementById('editExtNameEn').value.trim();
  const descriptionEn = document.getElementById('editExtDescEn').value.trim();
  const author = document.getElementById('editExtAuthor').value.trim();
  const iconUrl = document.getElementById('editExtIcon').value.trim();
  const website = document.getElementById('editExtWebsite').value.trim();
  const tags = document.getElementById('editExtTags').value.split(',').map(t => t.trim()).filter(Boolean);

  if (!slug || !name) {
    editExtensionError.textContent = '扩展标识与名称不能为空';
    editExtensionError.classList.remove('hidden');
    return;
  }

  try {
    let result;
    if (extId) {
      const { data, error } = await appSupabase.client.rpc('dev_update_extension', {
        p_extension_id: extId, p_name: name, p_description: description,
        p_name_en: nameEn, p_description_en: descriptionEn, p_author: author,
        p_icon_url: iconUrl, p_website: website, p_tags: tags
      });
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await appSupabase.client.rpc('dev_create_extension', {
        p_slug: slug, p_name: name, p_description: description,
        p_name_en: nameEn, p_description_en: descriptionEn, p_author: author,
        p_icon_url: iconUrl, p_website: website, p_tags: tags
      });
      if (error) throw error;
      result = data;
    }

    if (result && result.success === false) {
      editExtensionError.textContent = result.message || i18n.t('dev.devSaveFail') || '操作失败';
      editExtensionError.classList.remove('hidden');
      return;
    }

    closeEditExtensionModal();
    loadExtensions();
    alert(extId ? (i18n.t('dev.devUpdated')) : (i18n.t('dev.devCreated')));
  } catch (error) {
    console.error('Save dev extension error:', error);
    editExtensionError.textContent = error.message || i18n.t('dev.devSaveFail') || '操作失败';
    editExtensionError.classList.remove('hidden');
  }
}

async function deleteExtension(extId) {
  if (!confirm(i18n.t('dev.devDeleteConfirm') || '确定要删除该扩展吗？')) return;
  try {
    const { error } = await appSupabase.client.rpc('dev_delete_extension', { p_extension_id: extId });
    if (error) {
      alert(error.message);
      return;
    }
    loadExtensions();
  } catch (error) {
    console.error('Delete dev extension error:', error);
  }
}

// 开发者发布/取消发布自己的扩展（与后台管理员发布方式一致）
async function toggleDevPublish(extId, isPublished) {
  if (!confirm(isPublished
    ? (i18n.t('dev.devPublishConfirm') || '确定要发布该扩展吗？发布后即可被其他用户下载。')
    : (i18n.t('dev.devUnpublishConfirm') || '确定要取消发布该扩展吗？取消后将不再对外提供下载。'))) return;
  try {
    const { data, error } = await appSupabase.client.rpc('dev_toggle_publish', {
      p_extension_id: extId,
      p_is_published: Boolean(isPublished)
    });
    if (error) { alert(error.message); return; }
    if (data && data.success === false) { alert(data.message); return; }
    alert(data && data.message ? data.message : i18n.t('common.success'));
    loadExtensions();
  } catch (error) {
    console.error('Toggle dev publish error:', error);
  }
}

// ========== 扩展详情（含版本 + 审核 + 云数据） ==========

async function viewExtensionDetail(extId) {
  currentDetailExtensionId = extId;
  try {
    const { data, error } = await appSupabase.client.rpc('get_extension_details', { p_extension_id: extId });
    if (error || !data) {
      alert(i18n.t('common.error'));
      return;
    }

    // 并行加载审核记录与云数据
    const [reviewsData, cloudData] = await Promise.all([
      appSupabase.client.rpc('dev_list_reviews', { p_extension_id: extId }).then(r => r.data || []).catch(() => []),
      loadCloudDataForExtension(extId)
    ]);
    currentDetailCloudData = cloudData;

    document.getElementById('extensionDetailTitle').textContent = data.name || data.slug;
    renderExtensionDetail(data, reviewsData);
  } catch (error) {
    console.error('View dev extension detail error:', error);
  }
}

async function loadCloudDataForExtension(extId) {
  const { data, error } = await appSupabase.client.rpc('dev_list_extension_cloud_data', { p_extension_id: extId });
  if (error) return [];
  return data || [];
}

function renderExtensionDetail(ext, reviews) {
  const content = document.getElementById('extensionDetailContent');

  const versionsHtml = ext.versions && ext.versions.length > 0 ? `
    <table class="detail-table">
      <thead>
        <tr>
          <th>${i18n.t('admin.versionNumber') || '版本号'}</th>
          <th>${i18n.t('admin.changelog') || '更新日志'}</th>
          <th>${i18n.t('admin.fileSize') || '文件大小'}</th>
          <th>${i18n.t('admin.isLatest') || '最新'}</th>
          <th>${i18n.t('admin.createdAt') || '创建时间'}</th>
          <th>${i18n.t('common.actions') || '操作'}</th>
        </tr>
      </thead>
      <tbody>
        ${ext.versions.map(v => `
          <tr>
            <td>${escapeHtml(v.version_number)}</td>
            <td>${escapeHtml(v.changelog || '-')}</td>
            <td>${v.file_size ? (v.file_size / 1024).toFixed(1) + 'KB' : '-'}</td>
            <td>${v.is_latest ? '<span style="color:#22c55e">✓</span>' : '-'}</td>
            <td>${new Date(v.created_at).toLocaleDateString(devLocale())}</td>
            <td>${v.file_path ? `<button class="action-btn" onclick="downloadVersion('${v.file_path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">${i18n.t('admin.download') || '下载'}</button>` : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : `<p style="color:#a1a1aa">${i18n.t('admin.noVersions') || '暂无版本'}</p>`;

  // 审核记录摘要
  const reviewsHtml = reviews.length > 0 ? `
    <ul style="margin:0;padding-left:18px;">
      ${reviews.slice(0, 8).map(r => `
        <li style="margin-bottom:4px;">
          ${reviewTypeBadge(r.review_type)}
          <span class="${r.status === 'approved' ? 'review-badge approved' : (r.status === 'rejected' ? 'review-badge rejected' : 'review-badge pending')}">${reviewStatusText(r.status)}</span>
          ${r.version_number ? ' v' + escapeHtml(r.version_number) : ''}
          <span style="color:#a1a1aa;font-size:12px;">（${formatTime(r.created_at)}）</span>
        </li>
      `).join('')}
    </ul>
  ` : `<p style="color:#a1a1aa">${i18n.t('dev.devNoReviews') || '暂无审核记录'}</p>`;

  // 云数据区块（global + 本人 user）
  const cloudRowsHtml = currentDetailCloudData.length > 0
    ? currentDetailCloudData.map(row => {
        const scopeBadge = row.scope === 'global'
          ? `<span class="cloud-data-badge global">${i18n.t('admin.cloudDataScopeGlobal')}</span>`
          : `<span class="cloud-data-badge user">${i18n.t('admin.cloudDataScopeUser')}</span>`;
        const valStr = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
        return `
          <div class="code-card" style="margin-bottom:8px;">
            <div class="code-info">
              <div class="code-code">${scopeBadge} <span style="font-family:monospace;">${escapeHtml(row.key_name)}</span></div>
              <div class="code-details">
                <p style="font-family:monospace;font-size:12px;color:var(--text-secondary);white-space:pre-wrap;word-break:break-all;">${escapeHtml(valStr)}</p>
                <p style="font-size:12px;color:#a1a1aa;">${i18n.t('admin.cloudDataUpdatedAt')}: ${formatTime(row.updated_at)}</p>
              </div>
            </div>
            <div class="code-actions">
              <button class="action-btn edit" onclick="openCloudDataModal('${row.scope}', '${row.row_id}')">${i18n.t('admin.cloudDataEdit')}</button>
              <button class="action-btn delete" onclick="deleteCloudData('${row.row_id}')">${i18n.t('admin.cloudDataDelete')}</button>
            </div>
          </div>
        `;
      }).join('')
    : `<p style="color:#a1a1aa">${i18n.t('admin.cloudDataEmpty')}</p>`;

  content.innerHTML = `
    <div class="detail-section">
      <h3>${i18n.t('admin.basicInfo') || '基本信息'}</h3>
      <div class="detail-grid">
        <div><span class="detail-label">${i18n.t('admin.name') || '名称'}</span><span>${escapeHtml(ext.name)}</span></div>
        <div><span class="detail-label">${i18n.t('admin.slug') || '标识'}</span><span>${escapeHtml(ext.slug)}</span></div>
        <div><span class="detail-label">${i18n.t('admin.author') || '作者'}</span><span>${escapeHtml(ext.author || '-')}</span></div>
        <div><span class="detail-label">${i18n.t('admin.downloadCount') || '下载数'}</span><span>${ext.download_count || 0}</span></div>
        <div><span class="detail-label">${i18n.t('admin.website') || '网站'}</span><span>${ext.website ? '<a href="' + escapeHtml(ext.website) + '" target="_blank">' + escapeHtml(ext.website) + '</a>' : '-'}</span></div>
        <div><span class="detail-label">${i18n.t('admin.tags') || '标签'}</span><span>${(ext.tags || []).map(t => '<span class="tag-chip">' + escapeHtml(t) + '</span>').join('') || '-'}</span></div>
      </div>
    </div>

    <div class="detail-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3>${i18n.t('admin.versions') || '版本列表'} (${ext.versions?.length || 0})</h3>
        <button class="btn btn-primary" onclick="openAddVersionModal()">${i18n.t('dev.devNewVersion') || '上传新版本'}</button>
      </div>
      ${versionsHtml}
    </div>

    <div class="detail-section">
      <h3 style="margin-bottom:10px;">${i18n.t('dev.devReviews') || '审核记录'}</h3>
      ${reviewsHtml}
    </div>

    <div class="detail-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3>${i18n.t('dev.devCloudData') || '扩展云数据'}</h3>
        <button class="btn btn-secondary" onclick="openCloudDataModal('global')">${i18n.t('dev.devAddCloudData') || '新建云数据'}</button>
      </div>
      <p class="appversions-hint" style="margin-bottom:10px;">${i18n.t('dev.devCloudDataHint') || ''}</p>
      ${cloudRowsHtml}
    </div>
  `;

  extensionDetailModal.classList.remove('hidden');
  extensionDetailModal.classList.add('active');
}

function reviewTypeBadge(type) {
  const label = type === 'create' ? (i18n.t('admin.reviewTypeCreate') || '创建扩展')
              : type === 'version' ? (i18n.t('admin.reviewTypeVersion') || '上传版本')
              : (i18n.t('admin.reviewTypeUpdate') || '修改信息');
  return `<span class="tag-chip">${label}</span>`;
}

function reviewStatusText(status) {
  if (status === 'approved') return i18n.t('admin.reviewStatusApproved') || '已通过';
  if (status === 'rejected') return i18n.t('admin.reviewStatusRejected') || '已拒绝';
  return i18n.t('admin.reviewStatusPending') || '待审核';
}

function closeExtensionDetailModal() {
  extensionDetailModal.classList.remove('active');
  setTimeout(() => extensionDetailModal.classList.add('hidden'), 200);
}

// 下载指定版本的扩展源文件（通过签名 URL）
async function downloadVersion(filePath) {
  try {
    const fileName = filePath.split('/').pop() || 'extension.zip';
    const { data, error } = await appSupabase.client.storage
      .from('extension-files')
      .createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) throw error || new Error('签名失败');
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error('Download version error:', err);
    alert(err?.message || (i18n.t('admin.downloadFailed') || '下载失败'));
  }
}

// ========== 上传新版本 ==========

function resetAddVersionForm() {
  document.getElementById('versionNumber').value = '';
  document.getElementById('versionChangelog').value = '';
  document.getElementById('versionFile').value = '';
  document.getElementById('versionMinApp').value = '';
  document.getElementById('versionMinAppCode').value = '';
  const statusEl = document.getElementById('manifestParseStatus');
  statusEl.classList.add('hidden');
  statusEl.classList.remove('parsing', 'success', 'error');
  statusEl.textContent = '';
  document.getElementById('addVersionError').classList.add('hidden');
}

function openAddVersionModal() {
  if (!currentDetailExtensionId) return;
  document.getElementById('versionExtensionId').value = currentDetailExtensionId;
  resetAddVersionForm();
  const modal = document.getElementById('addVersionModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeAddVersionModal() {
  const modal = document.getElementById('addVersionModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function handleVersionFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('manifestParseStatus');
  const errorEl = document.getElementById('addVersionError');
  errorEl.classList.add('hidden');

  statusEl.classList.remove('hidden', 'success', 'error');
  statusEl.classList.add('parsing');
  statusEl.textContent = i18n.t('admin.manifestParsing') || '正在解析 manifest.json...';

  try {
    const buffer = await file.arrayBuffer();
    const result = await parseManifestFromZip(buffer);

    if (!result) {
      statusEl.classList.remove('parsing', 'success');
      statusEl.classList.add('error');
      statusEl.textContent = i18n.t('admin.manifestNotFound') || '未在 ZIP 中找到 manifest.json';
      return;
    }

    const manifest = result.manifest;
    const locales = result.locales || {};
    const i18nResolved = resolveManifestI18n(manifest, locales);

    const fillField = (id, value) => {
      const el = document.getElementById(id);
      if (el && value != null && value !== '') el.value = value;
    };
    fillField('versionNumber', manifest.version);
    fillField('versionMinApp', manifest.min_app_version);
    fillField('versionMinAppCode', manifest.min_app_version_code);

    statusEl.classList.remove('parsing', 'error');
    statusEl.classList.add('success');
    const displayName = i18nResolved.name || manifest.name || '';
    statusEl.textContent = `${i18n.t('admin.manifestParsed') || '已解析 manifest'}：${displayName ? displayName + ' ' : ''}${manifest.version ? 'v' + manifest.version + ' ' : ''}(${result.fileName})`;
  } catch (err) {
    console.error('Parse manifest from zip error:', err);
    statusEl.classList.remove('parsing', 'success');
    statusEl.classList.add('error');
    statusEl.textContent = (i18n.t('admin.manifestParseFailed') || '解析 manifest 失败') + ': ' + err.message;
  }
}

async function addVersion(e) {
  e.preventDefault();

  const extensionId = document.getElementById('versionExtensionId').value;
  const versionNumber = document.getElementById('versionNumber').value.trim();
  const changelog = document.getElementById('versionChangelog').value.trim();
  const versionFile = document.getElementById('versionFile').files[0];
  const minAppVersion = document.getElementById('versionMinApp').value.trim();
  const minAppVersionCodeRaw = document.getElementById('versionMinAppCode').value.trim();
  const minAppVersionCode = minAppVersionCodeRaw ? parseInt(minAppVersionCodeRaw, 10) : null;
  const errorEl = document.getElementById('addVersionError');
  const submitBtn = document.getElementById('uploadVersionBtn');
  const progressWrap = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressPercent = document.getElementById('uploadProgressPercent');
  const progressStage = document.getElementById('uploadProgressStage');
  errorEl.classList.add('hidden');

  if (!versionFile) {
    errorEl.textContent = i18n.t('admin.selectZip') || '请选择ZIP文件';
    errorEl.classList.remove('hidden');
    return;
  }

  const setProgress = (percent, stageKey, fallback) => {
    const clamped = Math.max(0, Math.min(100, percent));
    progressFill.style.width = clamped + '%';
    progressPercent.textContent = Math.round(clamped) + '%';
    if (stageKey) progressStage.textContent = i18n.t(stageKey) || fallback;
  };

  progressWrap.classList.remove('hidden');
  setProgress(0, 'admin.stagePreparing', '准备中...');
  submitBtn.disabled = true;
  submitBtn.classList.add('disabled');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = i18n.t('admin.uploading') || '上传中...';

  try {
    setProgress(2, 'admin.stageReadingFile', '正在读取文件...');
    const fileBuffer = await versionFile.arrayBuffer();
    const fileSize = versionFile.size;
    setProgress(6, 'admin.stageChecksum', '正在计算校验和...');
    const fileChecksum = await calculateChecksum(fileBuffer);
    setProgress(10, 'admin.stageUploading', '正在上传文件...');
    const filePath = `extensions/${extensionId}/${versionNumber}/${versionFile.name}`;

    const uploadUrl = `${appSupabase.client.supabaseUrl}/storage/v1/object/extension-files/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
    const { data: sessionData } = await appSupabase.client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('apikey', appSupabase.client.supabaseKey);
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.setRequestHeader('x-upsert', 'true');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const overall = 10 + (ev.loaded / ev.total) * 80;
          setProgress(overall, 'admin.stageUploading', '正在上传文件...');
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(90, 'admin.stageCreatingVersion', '正在创建版本记录...');
          resolve();
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.message) msg = resp.message;
            else if (resp.error) msg = resp.error;
          } catch (_) {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
      xhr.onabort = () => reject(new Error('Upload aborted'));
      xhr.send(fileBuffer);
    });

    const { data: result, error } = await appSupabase.client.rpc('dev_create_extension_version', {
      p_extension_id: extensionId,
      p_version_number: versionNumber,
      p_changelog: changelog,
      p_file_path: filePath,
      p_file_size: fileSize,
      p_checksum: fileChecksum,
      p_min_app_version: minAppVersion,
      p_min_app_version_code: minAppVersionCode
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
      return;
    }
    if (result && result.success === false) {
      errorEl.textContent = result.message;
      errorEl.classList.remove('hidden');
      return;
    }

    setProgress(100, 'admin.stageDone', '完成');
    closeAddVersionModal();
    closeExtensionDetailModal();
    loadExtensions();
    alert(i18n.t('dev.devVersionSubmitted'));
  } catch (error) {
    console.error('Add version error:', error);
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');
    submitBtn.textContent = originalBtnText;
    setTimeout(() => {
      progressWrap.classList.add('hidden');
      setProgress(0, '', '');
    }, 800);
  }
}

// ========== 扩展云数据（合并到扩展详情，global + 本人 user） ==========

function closeCloudDataModal() {
  const modal = document.getElementById('cloudDataModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function openCloudDataModal(scope, rowId) {
  const form = document.getElementById('cloudDataForm');
  form.reset();
  document.getElementById('cloudDataRowId').value = rowId || '';
  document.getElementById('cloudDataExtensionId').value = currentDetailExtensionId;
  document.getElementById('cloudDataScopeFixed').value = scope || 'global';
  document.getElementById('cloudDataError').classList.add('hidden');
  document.getElementById('cloudDataModalTitle').textContent = i18n.t('dev.devAddCloudData') || '新建云数据';

  if (rowId) {
    const row = currentDetailCloudData.find(r => r.row_id === rowId);
    if (row) {
      document.getElementById('cloudDataModalTitle').textContent = i18n.t('admin.cloudDataEdit');
      document.getElementById('cloudDataKey').value = row.key_name;
      const valStr = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
      document.getElementById('cloudDataValue').value = valStr;
    }
  }

  const modal = document.getElementById('cloudDataModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

async function saveCloudData(e) {
  e.preventDefault();
  const extensionId = document.getElementById('cloudDataExtensionId').value;
  const scope = document.getElementById('cloudDataScopeFixed').value;
  const rowId = document.getElementById('cloudDataRowId').value;
  const key = document.getElementById('cloudDataKey').value.trim();
  const errorEl = document.getElementById('cloudDataError');
  errorEl.classList.add('hidden');

  if (!key) {
    errorEl.textContent = i18n.t('admin.cloudDataMissingKey') || '键名不能为空';
    errorEl.classList.remove('hidden');
    return;
  }

  let parsedValue;
  try {
    parsedValue = JSON.parse(document.getElementById('cloudDataValue').value);
  } catch (err) {
    errorEl.textContent = i18n.t('admin.cloudDataInvalidJson') || '值必须是合法 JSON';
    errorEl.classList.remove('hidden');
    return;
  }

  // 编辑现有记录时按 row 更新
  if (rowId) {
    const { error } = await appSupabase.client.rpc('dev_delete_extension_cloud_data', { p_row_id: rowId });
    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
      return;
    }
  }

  try {
    const { error } = await appSupabase.client.rpc('dev_upsert_extension_cloud_data', {
      p_extension_id: extensionId, p_scope: scope, p_key: key, p_value: parsedValue
    });
    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
      return;
    }
    closeCloudDataModal();
    viewExtensionDetail(currentDetailExtensionId);
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  }
}

async function deleteCloudData(rowId) {
  if (!confirm(i18n.t('admin.cloudDataDeleteConfirm'))) return;
  const { error } = await appSupabase.client.rpc('dev_delete_extension_cloud_data', { p_row_id: rowId });
  if (error) {
    alert(error.message);
    return;
  }
  viewExtensionDetail(currentDetailExtensionId);
}

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', () => {
  if (addExtensionBtn) addExtensionBtn.addEventListener('click', openAddExtensionModal);
  if (editExtensionForm) editExtensionForm.addEventListener('submit', saveExtension);
  if (addVersionForm) addVersionForm.addEventListener('submit', addVersion);
  const versionFileInput = document.getElementById('versionFile');
  if (versionFileInput) versionFileInput.addEventListener('change', handleVersionFileChange);
  const cloudDataForm = document.getElementById('cloudDataForm');
  if (cloudDataForm) cloudDataForm.addEventListener('submit', saveCloudData);
  const editExtIconInput = document.getElementById('editExtIcon');
  if (editExtIconInput) {
    editExtIconInput.addEventListener('input', () => refreshIconPreview(editExtIconInput.value.trim()));
  }
  // 快捷创建绑定
  const quickCreateDevBtn = document.getElementById('quickCreateDevBtn');
  if (quickCreateDevBtn) quickCreateDevBtn.addEventListener('click', openQuickCreateModal);
  const quickCreateForm = document.getElementById('quickCreateForm');
  if (quickCreateForm) quickCreateForm.addEventListener('submit', quickCreateSubmit);
  const quickCreateFileInput = document.getElementById('quickCreateFile');
  if (quickCreateFileInput) quickCreateFileInput.addEventListener('change', handleQuickCreateFileChange);
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      if (editExtensionModal && !editExtensionModal.classList.contains('hidden')) closeEditExtensionModal();
      if (extensionDetailModal && !extensionDetailModal.classList.contains('hidden')) closeExtensionDetailModal();
      const qcModal = document.getElementById('quickCreateModal');
      if (qcModal && !qcModal.classList.contains('hidden')) closeQuickCreateModal();
    }
  });
});

document.addEventListener('languageChanged', () => {
  if (currentDetailExtensionId) {
    viewExtensionDetail(currentDetailExtensionId);
  }
});

window.loadExtensions = loadExtensions;
window.viewExtensionDetail = viewExtensionDetail;
window.editExtension = editExtension;
window.toggleDevPublish = toggleDevPublish;
window.deleteExtension = deleteExtension;
window.openAddVersionModal = openAddVersionModal;
window.closeExtensionDetailModal = closeExtensionDetailModal;
window.closeAddVersionModal = closeAddVersionModal;
window.openCloudDataModal = openCloudDataModal;
window.closeCloudDataModal = closeCloudDataModal;
window.deleteCloudData = deleteCloudData;
window.downloadVersion = downloadVersion;
window.openQuickCreateModal = openQuickCreateModal;
window.closeQuickCreateModal = closeQuickCreateModal;

// 侧边栏移动端展开/收起功能
function initSidebarToggle() {
  const sidebarToggle = document.querySelector('.sidebar-toggle');
  const sidebarMenu = document.querySelector('.sidebar-menu');
  
  if (!sidebarToggle || !sidebarMenu) return;
  
  // 从 localStorage 读取展开状态，默认为 false（收起）
  const isExpanded = localStorage.getItem('sidebar-expanded') === 'true';
  if (isExpanded) {
    sidebarMenu.classList.add('expanded');
  }
  
  sidebarToggle.addEventListener('click', function() {
    sidebarMenu.classList.toggle('expanded');
    const expanded = sidebarMenu.classList.contains('expanded');
    localStorage.setItem('sidebar-expanded', expanded);
  });
}

window.addEventListener('load', () => {
  if (window.loadExtensions) window.loadExtensions();
  initSidebarToggle();
});