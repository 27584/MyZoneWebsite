// myzone.ai-assistant / image-attach.js
// 把用户附件（图片 / 文本·代码文件）混进对话。
//   - state.attach：当前输入区待发的附件 [{ type:'image', dataUrl, ... }] 或 [{ type:'text', text, ... }]
//   - 图片来源：粘贴截图 / 「附件」按钮选图，canvas 压缩后入列 → 缩略预览
//   - 文本文件来源：本机 / MyZone 读取为 UTF-8 文本，作为 text part 注入消息
//   - 发送时由 buildContent 合成 OpenAI 多模态 content 数组（图片 image_url、文本文件 text part）
//   - 单文件大小上限与附件数量上限由 MAX_ATTACH_SIZE / MAX_ATTACH_COUNT 控制

'use strict';

// 附件限制
const MAX_ATTACH_SIZE = 5 * 1024 * 1024; // 单文件上限 5MB
const MAX_ATTACH_COUNT = 10;             // 单轮附件数量上限

// 图片扩展名
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
// 文本/代码扩展名（读取为纯文本注入消息）
const TEXT_EXTS = [
  'txt', 'md', 'json', 'csv', 'tsv', 'log', 'ini', 'cfg', 'conf', 'env',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'java',
  'c', 'h', 'cpp', 'cxx', 'hpp', 'go', 'rs', 'rb', 'php', 'swift', 'kt',
  'html', 'htm', 'css', 'scss', 'less', 'sass', 'xml', 'yaml', 'yml', 'toml',
  'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'graphql', 'proto',
];
// 所有可附加的扩展名（本地/MyZone 选择器都用它过滤）
const FILE_EXTS = [...new Set([...IMG_EXTS, ...TEXT_EXTS])];

// 由文件名推断附件类型：'image' / 'text' / null（不支持）
function fileKindOf(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (IMG_EXTS.indexOf(ext) !== -1) return 'image';
  if (TEXT_EXTS.indexOf(ext) !== -1) return 'text';
  return null;
}

function hasImageAttachments() {
  return (state.attach || []).some((a) => a.type === 'image');
}

// 人类可读大小，如 "5 MB" / "640 KB"
function formatSize(bytes) {
  bytes = Math.max(0, Number(bytes) || 0);
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

// 归一化大小：取传入 size，缺失时按 base64 长度估算
function effSize(size, base64) {
  if (size) return Number(size) || 0;
  return Math.floor(String(base64 || '').length * 3 / 4);
}

// 返回 null=可加入；否则返回应提示 toast 的本地化文案
function limitMessage(size) {
  if (size > MAX_ATTACH_SIZE) return tSync('attachTooBig').replace('{size}', formatSize(MAX_ATTACH_SIZE));
  const n = attachImages().length;
  if (n >= MAX_ATTACH_COUNT) return tSync('attachTooMany').replace('{count}', String(MAX_ATTACH_COUNT));
  return '';
}

// 压缩图片：缩放到目标最长边、降低清晰度，控制 base64 体积（否则几个大图就会撑爆上下文）。
// 源为 PNG 时保留 PNG（截图/透明），其余转 JPEG。返回新的 dataURL。
function compressImageDataUrl(dataUrl, maxDim, quality) {
  const max = maxDim || 1280;
  const q = quality || 0.85;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width: w, height: h } = img;
        const scale = Math.min(1, max / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const mime = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        const out = canvas.toDataURL(mime, q);
        resolve(out);
      } catch (e) {
        // 压缩失败则退回原始 dataURL，不阻断插图；缩略图与发送共用同一份
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// 读取一个图片文件（File）为 dataURL
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function attachImages() {
  if (!state.attach) state.attach = [];
  return state.attach;
}

function hasAttachments() {
  return !!(state.attach && state.attach.length);
}

// 由扩展名推算图片 MIME（本机 pickAndRead / MyZone 读取返回的是 base64，无 MIME 头）
function mimeFromName(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif' };
  return map[ext] || 'image/png';
}

// 当前是否允许插图（模型级开关，默认启用；本地/内置模型均可配置 multimodal=false 关闭）
function currentModelMultimodal() {
  const m = (state.models || []).find(x => x.id === state.activeModelId);
  return !m || m.multimodal !== false;
}

// 统一入口：根据文件类型决定加入方式（图片走多模态 image_url，文本读为 UTF-8 文本）。
async function addAttach(name, base64, size) {
  const kind = fileKindOf(name);
  // 大小上限（归一化，size 缺失时按 base64 估算）
  const sizeLimit = effSize(size, base64);
  const blocked = limitMessage(sizeLimit);
  if (blocked) {
    window.myzone.toast.warning(blocked);
    return false;
  }
  if (kind === 'image') {
    const mime = mimeFromName(name);
    return addAttachFromImage(`data:${mime};base64,${base64}`, name, sizeLimit);
  }
  if (kind === 'text') {
    return addAttachFromText(base64, name, sizeLimit);
  }
  window.myzone.toast.warning(tSync('attachUnsupported'));
  return false;
}

// 加入图片（多模态校验 + 预览 + 后台异步压缩）。
// 先以原图立即入列渲染（所见即所得），压缩依赖 Image 加载 dataURL，若被宿主拦截永不回调也不阻塞。
async function addAttachFromImage(dataUrl, name, size) {
  if (!dataUrl) return false;
  if (!currentModelMultimodal()) {
    window.myzone.toast.warning(tSync('attachModelNotMultimodal'));
    return false;
  }
  const idx = attachImages().push({ type: 'image', dataUrl, name: name || 'image', size: size || 0 }) - 1;
  renderAttachPreview();
  compressImageDataUrl(dataUrl).then((out) => {
    if (out && out !== dataUrl) {
      const cur = attachImages()[idx];
      if (cur) cur.dataUrl = out;
    }
  }).catch(() => { /* 压缩失败用原图 */ });
  return true;
}

// 读取 base64 为 UTF-8 文本；返回 null 表示解析失败
async function base64ToUtf8(base64) {
  try {
    const resp = await fetch(`data:text/plain;base64,${base64}`);
    if (!resp.ok) return null;
    return await resp.text();
  } catch (e) {
    return null;
  }
}

// 加入文本/代码文件：解码为 UTF-8 文本加入附件（无需多模态，任意模型可用）
async function addAttachFromText(base64, name, size) {
  const text = await base64ToUtf8(base64);
  if (text === null) {
    window.myzone.toast.warning(tSync('attachFail'));
    return false;
  }
  attachImages().push({ type: 'text', name: name || 'file', size: size || 0, text });
  renderAttachPreview();
  return true;
}

// 从本机（外部空间）选文件：走 MyZone 原生对话框直接返回 base64
async function pickFromLocal() {
  try {
    const res = await window.myzone.external.pickAndRead({
      title: tSync('attachFromLocal'),
      filters: [
        { name: tSync('attachFilterImages'), extensions: IMG_EXTS },
        { name: tSync('attachFilterText'), extensions: TEXT_EXTS },
      ],
    });
    if (!res || !res.success) {
      if (res && res.error) window.myzone.toast.warning(String(res.error));
      return;
    }
    const base64 = String(res.data.content || '');
    if (!base64) return;
    const name = String(res.data.fileName || '');
    if (!fileKindOf(name)) {
      window.myzone.toast.warning(tSync('attachUnsupported'));
      return;
    }
    await addAttach(name, base64, res.data.size || 0);
  } catch (e) {
    window.myzone.toast.warning(tSync('attachFail'));
  }
}

// ========== 缩略/卡片预览 ==========
function renderAttachPreview() {
  const wrap = document.getElementById('attach-preview');
  if (!wrap) return;
  wrap.innerHTML = '';
  const items = attachImages();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const cell = document.createElement('div');
    const rmBtn = `<button class="attach-remove" type="button" title="${escapeHtml(tSync('attachRemove'))}" data-i=""></button>`;
    if (it.type === 'image') {
      cell.className = 'attach-cell';
      cell.innerHTML = `<img src="${escapeHtml(it.dataUrl)}" alt="">${rmBtn}`;
    } else {
      cell.className = 'attach-cell attach-cell-file';
      cell.innerHTML =
        `<span class="attach-file-icon" aria-hidden="true"></span>` +
        `<span class="attach-file-name">${escapeHtml(it.name)}</span>` +
        `<span class="attach-file-size">${escapeHtml(formatSize(it.size || 0))}</span>${rmBtn}`;
    }
    cell.querySelector('.attach-remove').addEventListener('click', () => {
      attachImages().splice(i, 1);
      renderAttachPreview();
    });
    wrap.appendChild(cell);
  }
  wrap.hidden = !items.length;
}

function clearAttachments() {
  if (state.attach) state.attach.length = 0;
  renderAttachPreview();
}

// 把文本 + 附件合成 OpenAI 多模态 content。
// 无附件时保持纯文本字符串（历史/旧链路兼容）；有附件才用数组。
// 图片附附件 → image_url part；文本文件 → text part（带文件名/大小说明）。
function buildContent(text) {
  const items = attachImages();
  const trimmed = String(text || '').trim();
  if (!items.length) return trimmed || '';
  const parts = [];
  for (const it of items) {
    if (it.type === 'image') {
      parts.push({ type: 'image_url', image_url: { url: it.dataUrl } });
    } else {
      parts.push({ type: 'text', text: `【${it.name}｜${formatSize(it.size || 0)}】\n${it.text}` });
    }
  }
  if (trimmed) parts.push({ type: 'text', text: trimmed });
  return parts;
}

// ========== MyZone 空间选文件 ==========
// 直接走宿主扩展 API「filesystem.pickFile」，通过 allowedExts 限制可选的扩展名
async function pickFromMyzone() {
  let res;
  try {
    res = await window.myzone.filesystem.pickFile({
      title: tSync('attachFromMyzone'),
      allowedExts: FILE_EXTS,
    });
  } catch (e) {
    window.myzone.toast.warning(tSync('attachFail'));
    return;
  }
  if (!res || !res.success || !res.data) return; // 用户取消
  const item = res.data;
  try {
    const r = await window.myzone.filesystem.read(item.nodeId, { binary: true });
    if (!r || !r.success || !r.data) {
      window.myzone.toast.warning(tSync('attachReadFail'));
      return;
    }
    const name = String(item.name || '');
    if (!fileKindOf(name)) {
      window.myzone.toast.warning(tSync('attachUnsupported'));
      return;
    }
    await addAttach(name, r.data, item.size || 0);
  } catch (e) {
    window.myzone.toast.warning(tSync('attachReadFail'));
  }
}

// ========== 事件绑定 ==========
function bindAttachEvents() {
  const btn = document.getElementById('attach-btn');
  const menu = document.getElementById('attach-menu');
  const ta = document.getElementById('input');

  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', (e) => {
      if (menu && !menu.hidden && !menu.contains(e.target) && e.target !== btn) menu.hidden = true;
    });
    const fromLocal = document.getElementById('attach-from-local');
    const fromMz = document.getElementById('attach-from-myzone');
    if (fromLocal) fromLocal.addEventListener('click', () => { menu.hidden = true; pickFromLocal(); });
    if (fromMz) fromMz.addEventListener('click', () => { menu.hidden = true; pickFromMyzone(); });
  }

  if (ta) {
    ta.addEventListener('paste', (e) => {
      if (!e.clipboardData || state.busy) return;
      // 截图/复制图片：优先取 files 里的图片类型
      const f = Array.from(e.clipboardData.files || []).find(x => /^image\//.test(x.type || ''));
      if (f) {
        e.preventDefault();
        const blocked = limitMessage(effSize(f.size, ''));
        if (blocked) { window.myzone.toast.warning(blocked); return; }
        fileToDataUrl(f).then(raw => addAttachFromImage(raw, f.name || 'image', f.size));
      }
    });
  }
}