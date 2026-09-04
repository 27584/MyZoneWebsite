// ZoneMind 网页版：skillbar.js
// 豆包式底部技能栏：用户可手动添加「图片生成 / 视频生成」技能，在技能条上选择生成模型，
// 发送消息时直接调用内置生成模型（不依赖模型自主调用工具，也无需把生成技能挂到当前智能体）。

'use strict';

const SVG_IMAGE =
  '<svg class="sc-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
const SVG_VIDEO =
  '<svg class="sc-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="M22 8l-6 4 6 4V8z"/></svg>';
const SVG_CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_MODEL_ARROW =
  '<svg class="sc-model-arrow" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

// 是否已启用手动技能
function hasManualSkill() {
  return !!(state.manualSkill && state.manualSkill.mode);
}

// 把网关返回的图片列表规整为 URL 数组
function normalizeImageUrls(images) {
  return (images || [])
    .map((i) => {
      const raw = (i && typeof i === 'object') ? (i.url || i.b64_json || '') : (typeof i === 'string' ? i : '');
      if (!raw) return '';
      // 上游可能返回纯 base64（无 data:image/... 前缀），补上浏览器可识别的前缀；
      // 否则保持原样（http(s)://、data:、extensions: 等直接可用）。
      if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        return 'data:image/png;base64,' + String(raw).replace(/\s+/g, '');
      }
      return raw;
    })
    .filter(Boolean);
}

// 当前技能模式可用的内置模型（按 model_type 过滤）
function manualSkillModels() {
  const mode = state.manualSkill && state.manualSkill.mode;
  if (!mode) return [];
  return (state.builtinModels || []).filter(m => m.builtin && m.model_type === mode);
}

// 固定费率文案：图片按「张」、视频按「秒」计费；折后价划线显示原价
function manualModelCostHtml(model) {
  const eff = Number(model.effectiveFixed) || 0;
  const orig = Number(model.originalFixed) || 0;
  const unitKey = (state.manualSkill && state.manualSkill.mode === 'video') ? 'perSecondCredits' : 'perImageCredits';
  const effText = tSync(unitKey).replace('{{cost}}', formatCredits(eff));
  if (orig > 0 && eff < orig) {
    const origText = tSync(unitKey).replace('{{cost}}', formatCredits(orig));
    return effText + `<span class="smi-orig">${origText}</span>`;
  }
  return effText;
}

// ========== 生成参数（图片/视频可选的尺寸、比例、时长、画幅） ==========
// 参数配置与 agnes 文档对齐：
//   - 图片：size（1K/2K/3K/4K）+ ratio（1:1|3:4|4:3|16:9|9:16|2:3|3:2|21:9）
//   - 视频：seconds（"4"–"12"）+ aspectRatio（画幅）
function paramConfigs(mode) {
  if (mode === 'image') {
    return [
      { key: 'size', labelKey: 'genParamSize', default: '2K', options: ['1K', '2K', '3K', '4K'] },
      { key: 'ratio', labelKey: 'genParamRatio', default: '1:1', options: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'] },
    ];
  }
  if (mode === 'video') {
    return [
      { key: 'seconds', labelKey: 'genParamSeconds', default: '5', options: ['4', '5', '6', '7', '8', '9', '10', '11', '12'] },
      { key: 'aspectRatio', labelKey: 'genParamAspectRatio', default: '16:9', options: ['16:9', '21:9', '4:3', '1:1', '3:4', '9:16'] },
    ];
  }
  return [];
}

function defaultParams(mode) {
  const p = {};
  for (const c of paramConfigs(mode)) p[c.key] = c.default;
  return p;
}

// 关闭所有参数下拉
function closeSkillParamMenus() {
  document.querySelectorAll('.skill-param-menu.visible').forEach((m) => m.classList.remove('visible'));
}

// 在芯片上追加一个参数选择按钮（紧凑下拉）
function appendSkillParam(chip, cfg) {
  const params = state.manualSkill.params || {};
  const cur = params[cfg.key] || cfg.default;
  const btn = el('span', 'sc-param');
  btn.title = tSync(cfg.labelKey);
  btn.innerHTML = `<span class="scp-key">${escapeHtml(tSync(cfg.labelKey))}</span><span class="scp-val">${escapeHtml(cur)}</span>${SVG_MODEL_ARROW}`;
  const menu = el('div', 'skill-param-menu');
  for (const opt of cfg.options) {
    const item = el('div', 'scp-item' + (opt === cur ? ' active' : ''));
    item.textContent = opt;
    item.addEventListener('click', (e) => {
          e.stopPropagation();
          params[cfg.key] = opt;
          persistSkillChoice();
          renderSkillBar();
        });
    menu.appendChild(item);
  }
  btn.appendChild(menu);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !menu.classList.contains('visible');
    closeSkillParamMenus();
    closeSkillModelMenus();
    menu.classList.toggle('visible', willOpen);
  });
  chip.appendChild(btn);
}

const SVG_SKILL =
  '<svg class="sc-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

// 渲染技能条：生成技能芯片（名称 + 模型选择 + 移除）+ 暂态手动技能标签（非生成类）
function renderSkillBar() {
  const bar = $('skill-bar');
  if (!bar) return;
  const mode = state.manualSkill && state.manualSkill.mode;
  const trans = (state.transientSkills || [])
    .map((id) => (SKILL_REGISTRY || []).find((s) => s.id === id))
    .filter(Boolean);
  const active = !!mode || trans.length > 0;
  if (!active) {
    bar.classList.remove('active');
    bar.innerHTML = '';
    restoreInputPlaceholder();
    return;
  }
  bar.classList.add('active');
  bar.innerHTML = '';

  // 生成技能芯片（image / video）
  if (mode) {
    const label = mode === 'image' ? tSync('manualImageGen') : tSync('manualVideoGen');
    const icon = mode === 'image' ? SVG_IMAGE : SVG_VIDEO;
    const models = manualSkillModels();
    const activeModel = state.builtinModels.find(m => m.id === state.manualSkill.modelId);

    const chip = el('div', 'skill-chip');
    chip.appendChild(el('span', 'sc-label', icon + escapeHtml(label)));

    const modelBtn = el('span', 'sc-model');
    modelBtn.innerHTML = `<span>${escapeHtml(activeModel ? activeModel.name : tSync('skillSelectModel'))}</span>${SVG_MODEL_ARROW}`;
    const menu = el('div', 'skill-model-menu');
    if (models.length) {
      for (const m of models) {
        const item = el('div', 'skill-model-item' + (m.id === state.manualSkill.modelId ? ' active' : ''));
        item.innerHTML = `<span class="smi-name">${escapeHtml(m.name)}</span><span class="smi-cost">${manualModelCostHtml(m)}</span>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          state.manualSkill.modelId = m.id;
          persistSkillChoice();
          renderSkillBar();
        });
        menu.appendChild(item);
      }
    } else {
      const empty = el('div', 'skill-model-item', escapeHtml(tSync(mode === 'image' ? 'skillNoImageModel' : 'skillNoVideoModel')));
      empty.style.cursor = 'default';
      menu.appendChild(empty);
    }
    modelBtn.appendChild(menu);
    modelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains('visible');
      closeSkillModelMenus();
      closeSkillParamMenus();
      menu.classList.toggle('visible', willOpen);
    });
    chip.appendChild(modelBtn);

    // 生成参数选择按钮（图片：尺寸/比例；视频：时长/画幅）
    for (const cfg of paramConfigs(mode)) appendSkillParam(chip, cfg);

    const closeBtn = el('button', 'sc-close', SVG_CLOSE);
    closeBtn.title = tSync('removeSkill');
    closeBtn.addEventListener('click', () => {
      state.manualSkill = null;
      renderSkillBar();
    });
    chip.appendChild(closeBtn);

    bar.appendChild(chip);
  }

  // 暂态手动技能标签（非生成类）：纯视觉标签，随下次发送把技能提示注入上下文
  for (const sk of trans) {
    const chip = el('div', 'skill-chip skill-chip-tag');
    chip.appendChild(el('span', 'sc-label', SVG_SKILL + escapeHtml(getSkillName(sk))));
    const closeBtn = el('button', 'sc-close', SVG_CLOSE);
    closeBtn.title = tSync('removeSkill');
    closeBtn.addEventListener('click', () => {
      removeTransientSkill(sk.id);
    });
    chip.appendChild(closeBtn);
    bar.appendChild(chip);
  }

  if (mode) setSkillPlaceholder(mode);
}

// 添加暂态手动技能：在技能条顶部显示标签，并把该技能提示注入当前会话上下文
function addTransientSkill(skillId) {
  const skill = (SKILL_REGISTRY || []).find((s) => s.id === skillId);
  if (!skill) return;
  if (!state.transientSkills) state.transientSkills = [];
  if (state.transientSkills.includes(skillId)) return;
  const frag = typeof skill.buildPrompt === 'function' ? skill.buildPrompt() : skill.prompt;
  if (frag && Array.isArray(state.history)) {
    const marker = `<!--myzone.manual-skill:${skillId}-->`;
    const sysIdx = state.history.findIndex((m) => m.role === 'system');
    const inject = { role: 'system', content: `${marker}\n【手动技能：${getSkillName(skill)}】\n${frag}` };
    if (sysIdx >= 0) state.history.splice(sysIdx + 1, 0, inject);
    else state.history.unshift(inject);
  }
  state.transientSkills.push(skillId);
  renderSkillBar();
  window.myzone.toast.show(`${tSync('manualSkillInjected')}：${getSkillName(skill)}`);
}

// 移除暂态手动技能：同时回退之前注入的提示片段
function removeTransientSkill(skillId) {
  state.transientSkills = (state.transientSkills || []).filter((id) => id !== skillId);
  if (Array.isArray(state.history)) {
    const marker = `<!--myzone.manual-skill:${skillId}-->`;
    state.history = state.history.filter((m) => !(m.role === 'system' && String(m.content || '').includes(marker)));
  }
  renderSkillBar();
}

// 清空全部暂态手动技能（回退注入的提示片段）。仅供手动「全部移除」等场景使用；
// 不再随回合结束自动调用——手动技能按会话持久，直到用户手动移除。
function clearTransientSkills() {
  for (const id of [...(state.transientSkills || [])]) removeTransientSkill(id);
}

// 按当前会话历史重建暂态手动技能列表：注入的标记（<!--myzone.manual-skill:ID-->）
// 随会话消息持久化，切换会话时据此恢复该会话各自启用的手动技能，互不串扰。
function syncTransientSkillsFromHistory() {
  const ids = [];
  if (Array.isArray(state.history)) {
    for (const m of state.history) {
      if (!m || m.role !== 'system' || typeof m.content !== 'string') continue;
      const m2 = /<!--myzone\.manual-skill:([\w-]+)-->/.exec(m.content);
      if (m2 && !ids.includes(m2[1])) ids.push(m2[1]);
    }
  }
  state.transientSkills = ids.filter((id) => (SKILL_REGISTRY || []).some((s) => s.id === id));
  renderSkillBar();
}

// 渲染「添加技能」下拉：生成技能（图片/视频）+ 当前已启用的非生成技能
function renderSkillDropdown() {
  const dd = $('skill-dropdown');
  if (!dd) return;
  dd.innerHTML = '';

  const addItem = (inner) => {
    const item = el('div', 'skill-dropdown-item');
    item.innerHTML = inner;
    dd.appendChild(item);
    return item;
  };

  // 生成类手动入口
  addItem(SVG_IMAGE.replace('class="sc-icon"', 'class="sd-icon"') + `<span>${escapeHtml(tSync('manualImageGen'))}</span>`)
    .addEventListener('click', async (e) => {
      e.stopPropagation();
      dd.classList.remove('visible');
      await activateSkill('image');
    });
  addItem(SVG_VIDEO.replace('class="sc-icon"', 'class="sd-icon"') + `<span>${escapeHtml(tSync('manualVideoGen'))}</span>`)
    .addEventListener('click', async (e) => {
      e.stopPropagation();
      dd.classList.remove('visible');
      await activateSkill('video');
    });

  // 非生成技能：全部可手动选用（不做 enable 过滤），以暂态标签加入技能条
  const seen = new Set();
  for (const s of SKILL_REGISTRY) {
    if (!s || s.id === 'generative' || s.id === 'core' || s.id === '__mcp__') continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    addItem(SVG_SKILL.replace('class="sc-icon"', 'class="sd-icon"') + `<span>${escapeHtml(getSkillName(s))}</span>`)
      .addEventListener('click', (e) => {
        e.stopPropagation();
        dd.classList.remove('visible');
        addTransientSkill(s.id);
      });
  }

  if (dd.children.length === 0) {
    addItem(`<span>${escapeHtml(tSync('slashMenuEmpty'))}</span>`).style.cursor = 'default';
  }
}

function setSkillPlaceholder(mode) {
  const ta = inputEl();
  if (ta) ta.placeholder = tSync(mode === 'image' ? 'manualImagePlaceholder' : 'manualVideoPlaceholder');
}
function restoreInputPlaceholder() {
  const ta = inputEl();
  if (ta) ta.placeholder = tSync('inputPlaceholder');
}

// 关闭所有技能模型下拉
function closeSkillModelMenus() {
  document.querySelectorAll('.skill-model-menu.visible').forEach(m => m.classList.remove('visible'));
}

// 添加技能：image | video
const GEN_SKILL_KEY = 'myzone-skillbar-genskill-v1';

// 记住生成技能的当前选择（模式/模型/参数），下次激活同一模式时复用
function persistSkillChoice() {
  const s = state.manualSkill;
  const data = (s && s.mode) ? { mode: s.mode, modelId: s.modelId, params: s.params || null } : null;
  try { localStorage.setItem(GEN_SKILL_KEY, JSON.stringify(data)); } catch (e) { /* 存储不可用则忽略 */ }
}

function rememberedSkillChoice(mode) {
  try {
    const raw = localStorage.getItem(GEN_SKILL_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && d.mode === mode) return d;
  } catch (e) {
    return null;
  }
}

async function activateSkill(mode) {
  // 刷新一次内置模型，确保模型菜单为最新（站长开放/折扣变化即时生效）
  await loadModels();
  const mem = rememberedSkillChoice(mode);
  state.manualSkill = {
    skillId: 'generative',
    mode,
    modelId: null,
    params: (mem && mem.params) ? { ...defaultParams(mode), ...mem.params } : defaultParams(mode),
  };
  // 优先沿用上次选择的内置模型（其 id 仍存在时才复用），否则默认该类型第一个可用模型
  const first = manualSkillModels()[0];
  const keep = !!(mem && mem.modelId && manualSkillModels().some(m => m.id === mem.modelId));
  state.manualSkill.modelId = keep ? mem.modelId : (first ? first.id : null);
  renderSkillBar();
  persistSkillChoice();
  if (!first) {
    window.myzone.toast.warning(tSync(mode === 'image' ? 'skillNoImageModel' : 'skillNoVideoModel'));
  }
}

// 手动技能（技能栏）生成的占位气泡 DOM（含生成参数副标题），供初始创建与切回会话重建复用
function buildManualPendingEl(mode, params) {
  const p = params || {};
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant gen-pending';
  wrap.innerHTML = `<div class="avatar assistant">${SVG_AVATAR_ASSISTANT}</div>`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble gen-pending-bubble';
  const sub = mode === 'image'
    ? `${tSync('genParamSize')} ${p.size || '2K'} · ${tSync('genParamRatio')} ${p.ratio || '1:1'}`
    : `${tSync('genParamSeconds')} ${p.seconds || '5'}s · ${tSync('genParamAspectRatio')} ${p.aspectRatio || '16:9'}`;
  bubble.innerHTML = `
    <div class="gen-pending-head">
      <span class="gen-pending-dots"><span></span><span></span><span></span></span>
      <span class="gen-pending-title">${escapeHtml(mode === 'image' ? tSync('genImageWaiting') : tSync('genVideoWaiting'))}</span>
    </div>
    <div class="gen-pending-sub">${escapeHtml(sub)}</div>`;
  wrap.appendChild(bubble);
  insertBeforeThinking(wrap);
  scrollToBottomIfNearBottom();
  return wrap;
}

// 手动执行生成：返回 true 表示已由技能处理（不再走对话循环）
async function runManualSkill(text) {
  if (!hasManualSkill()) return false;
  const mode = state.manualSkill.mode;
  const genConv = state.conversations.find(c => c.id === state.currentConvId);
  if (!genConv) return true;

  // 解析模型：优先当前选中的，否则取该类型第一个可用模型
  let model = (state.builtinModels || []).find(m => m.id === state.manualSkill.modelId);
  if (!model) model = manualSkillModels()[0];
  if (!model) {
    window.myzone.toast.warning(tSync(mode === 'image' ? 'skillNoImageModel' : 'skillNoVideoModel'));
    return true;
  }

  const turnId = generateId();
  const userMsg = genConv.messages[genConv.messages.length - 1];
  if (userMsg) userMsg.turnId = turnId;

  // —— 生成中占位气泡（UI 反馈：打字动画 + 文案，视频轮询时还会更新副标题）——
  // 占位独立于会话消息，按会话存入 state.manualPendingEls；切走再切回时由 renderHistory 重建。
  const params = state.manualSkill.params || {};
  state.manualPendingEls.set(genConv.id, { el: buildManualPendingEl(mode, params), mode, params });

  // 更新当前（可能已被重建的）占位气泡文案
  function setPendingText(title, sub) {
    const p = state.manualPendingEls.get(genConv.id);
    const el = p && p.el;
    if (!el || !el.isConnected) return;
    if (title != null) {
      const titleEl = el.querySelector('.gen-pending-title');
      if (titleEl) titleEl.textContent = title;
    }
    if (sub != null) {
      const subEl = el.querySelector('.gen-pending-sub');
      if (subEl) subEl.textContent = sub;
    }
  }
  function getPendingEl() {
    const p = state.manualPendingEls.get(genConv.id);
    return p ? p.el : null;
  }

  // 把 pending bubble / 已完成结果 bubble 的替换工具拿到手
  function replacePending(html, usage, creditsCost) {
    const el = getPendingEl();
    if (el && el.isConnected) {
      // 保留外层 .msg 与 avatar，仅替换 bubble 内容
      el.classList.remove('gen-pending');
      const bubble = el.querySelector('.bubble');
      if (bubble) {
        bubble.className = 'bubble markdown-body';
        bubble.innerHTML = renderMarkdown(html);
        if (usage || creditsCost) {
          const foot = document.createElement('div');
          foot.className = 'token-usage';
          foot.textContent = formatUsageText(usage, creditsCost);
          bubble.appendChild(foot);
        }
      }
      scrollToBottomIfNearBottom();
      // 结果已就地展示并写入该会话历史，清掉占位记录，避免切回后按它重建出过期「生成中」气泡
      state.manualPendingEls.delete(genConv.id);
      return;
    }
    // 占位已游离（期间切过会话）：结果已写入该会话历史，清理占位记录，
    // 避免切回后残留一个已过期的「生成中」气泡。
    state.manualPendingEls.delete(genConv.id);
  }
  function failPending(errText) {
    const el = getPendingEl();
    if (!el || !el.isConnected) {
      // 占位已游离（用户已切走）：错误仅 toast 提示，不污染历史；清理占位记录避免切回残留
      state.manualPendingEls.delete(genConv.id);
      return;
    }
    el.classList.remove('gen-pending');
    const bubble = el.querySelector('.bubble');
    if (!bubble) return;
    bubble.className = 'bubble error-bubble';
    bubble.innerHTML = `<div class="gen-pending-head"><span class="gen-pending-fail-icon">!</span><span>${escapeHtml(String(errText || tSync('aiCallFailed')))}</span></div>`;
    scrollToBottomIfNearBottom();
    // 错误就地展示且不写历史，清掉占位记录，避免切回后重建出失效气泡
    state.manualPendingEls.delete(genConv.id);
  }

  // 媒体生成不占用 state.busy（不锁输入、不阻塞对话），仅在查看该会话时显示「停止」按钮
  state.mediaActiveConvs.add(genConv.id);
  state.mediaStopConvs.delete(genConv.id); // 新一轮生成：清除该会话之前的停止标记
  updateComposerUI();
  try {
    if (mode === 'image') {
      const p = state.manualSkill.params || {};
      const res = await window.myzone.ai.generateImage({
        modelId: model.builtinModelId,
        prompt: String(text || ''),
        size: p.size || '2K',
        ratio: p.ratio || '1:1',
      });
      if (!res || !res.success) {
        const msg = tSync('aiCallFailed') + (res && res.error ? `：${res.error}` : '');
        window.myzone.toast.error(msg);
        failPending(msg);
        return true;
      }
      const urls = normalizeImageUrls(res.images);
      if (!urls.length) {
        window.myzone.toast.error(tSync('genNoResult'));
        failPending(tSync('genNoResult'));
        return true;
      }
      const markdown = urls.map(u => `![${tSync('generatedImage')}](${u})`).join('\n\n');
      const cost = Number(res.credits_cost) || 0;
      const msg = { role: 'assistant', content: markdown, images: urls, uid: generateId(), ts: Date.now(), turnId, usage: res.usage || null, creditsCost: cost };
      genConv.messages.push(msg);
      replacePending(markdown, res.usage || null, cost);
    } else {
      const p = state.manualSkill.params || {};
      setPendingText(null, `${tSync('genParamSeconds')} ${p.seconds || '5'}s · ${tSync('genParamAspectRatio')} ${p.aspectRatio || '16:9'} · ${tSync('videoTaskSubmitted')}`);
      const sub = await window.myzone.ai.generateVideo({
        modelId: model.builtinModelId,
        prompt: String(text || ''),
        mode: 'text',
        size: '720P',
        seconds: p.seconds || '5',
        aspectRatio: p.aspectRatio || '16:9',
      });
      if (!sub || !sub.success) {
        const msg = tSync('aiCallFailed') + (sub && sub.error ? `：${sub.error}` : '');
        window.myzone.toast.error(msg);
        failPending(msg);
        return true;
      }
      window.myzone.toast.show(tSync('videoTaskSubmitted'));
      // 轮询收敛：生成本就可观（约 4–12s），连续 30s 得不到任何进展（上游持续查询失败，poll 带 note）
      // 就提前终止，避免死等到 12 分钟才提示超时；用户也可随时点「停止」中断。
      const maxNoProgress = 6;                 // 连续 6 次（约 30s）上游查询异常 → 放弃
      const maxPolls = Math.ceil((10 * 60) / 5); // 兜底上限约 10 分钟
      let pollCount = 0;
      let failStreak = 0;
      let done = null;
      while (pollCount < maxPolls) {
        if (state.mediaStopConvs.has(genConv.id)) return true; // 用户点「停止」：静默终止轮询，不追加结果
        await new Promise(r => setTimeout(r, 5000));
        pollCount += 1;
        setPendingText(null, `${tSync('genParamSeconds')} ${p.seconds || '5'}s · ${tSync('genParamAspectRatio')} ${p.aspectRatio || '16:9'} · 生成中（第 ${pollCount} 次轮询）`);
        const poll = await window.myzone.ai.pollVideo(sub.taskId);
        if (!poll || !poll.success) {
          const msg = tSync('genPollFailed') + (poll && poll.error ? `：${poll.error}` : '');
          window.myzone.toast.error(msg);
          failPending(msg);
          return true;
        }
        if (poll.status === 'completed') { done = poll; break; }
        if (poll.status === 'failed') {
          const msg = poll.error || tSync('genVideoFailed');
          window.myzone.toast.error(msg);
          failPending(msg);
          return true;
        }
        // 仍在生成：若上游查询持续失败（poll.note 存在）则累计，连续多次无进展即放弃
        if (poll.note) {
          failStreak += 1;
          if (failStreak >= maxNoProgress) {
            const msg = tSync('genVideoTimeout') + `（任务状态无法查询，已放弃等待）`;
            window.myzone.toast.error(msg);
            failPending(msg);
            return true;
          }
        } else {
          failStreak = 0;
        }
      }
      if (!done || !done.video_url) {
        window.myzone.toast.error(tSync('genVideoTimeout'));
        failPending(tSync('genVideoTimeout'));
        return true;
      }
      const markdown = `![${tSync('generatedVideo')}](${done.video_url})`;
      const cost = Number(done.credits_cost) || 0;
      const msg = { role: 'assistant', content: markdown, video_url: done.video_url, uid: generateId(), ts: Date.now(), turnId, creditsCost: cost };
      genConv.messages.push(msg);
      replacePending(markdown, null, cost);
    }
  } catch (err) {
    const msg = tSync('aiCallFailed') + (err && err.message ? `：${err.message}` : '');
    window.myzone.toast.error(msg);
    failPending(msg);
    return true;
  } finally {
    state.mediaActiveConvs.delete(genConv.id);
    state.mediaStopConvs.delete(genConv.id);
    updateComposerUI();
    // 定稿：标题、更新时间、持久化、列表与用量刷新
    genConv.title = getConvTitle(genConv.messages);
    genConv.updatedAt = Date.now();
    await saveConversations();
    renderConversationList();
    updateConvTitle();
    renderTokenGauges();
    if (state.aiReady) refreshModelMeta();
  }
  return true;
}

// ========== 模型自主调用的异步生成后台调度 ==========
// 生成图片/视频等异步工具（tool.async）提交后，任务入队 state.mediaTasks：
//   - 视频：调度器每 5s 轮询 /video/status，完成后原地替换占位气泡并写入会话历史（按秒结算 credits）
//   - 图片：无独立轮询端点，入队时直接挂 Promise 完成回调（generate_image 已后台发起请求）
// 均不占用 state.busy，不阻塞对话。
let _mediaSchedulerTimer = null;

// 渲染「生成中」占位气泡（仅当正在查看对应会话时；否则只入队，切换回来自动从历史回放）
function createGenPendingBubble(task) {
  const isImage = task.mode === 'image';
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant gen-pending';
  wrap.innerHTML = `<div class="avatar assistant">${SVG_AVATAR_ASSISTANT}</div>`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble gen-pending-bubble';
  bubble.innerHTML = `
    <div class="gen-pending-head">
      <span class="gen-pending-dots"><span></span><span></span><span></span></span>
      <span class="gen-pending-title">${escapeHtml(tSync(isImage ? 'genImageWaiting' : 'genVideoWaiting'))}</span>
    </div>
    <div class="gen-pending-sub">${escapeHtml(tSync(isImage ? 'imageTaskSubmitted' : 'videoTaskSubmitted'))}</div>`;
  wrap.appendChild(bubble);
  insertBeforeThinking(wrap);
  scrollToBottomIfNearBottom();
  return wrap;
}

// 入队一个后台媒体任务并启动调度器；图片任务在此挂 Promise 完成回调
function enqueueMediaTask(task) {
  const convId = task.convId || state.currentConvId;
  const domEl = (convId === state.currentConvId) ? createGenPendingBubble(task) : null;
  state.mediaActiveConvs.add(convId);
  state.mediaStopConvs.delete(convId); // 新一轮任务：清除该会话之前的停止标记
  updateComposerUI();
  const t = { ...task, convId, domEl, failStreak: 0, startedAt: Date.now() };
  state.mediaTasks.push(t);
  if (t.mode === 'image') attachImageCompletion(t);
  ensureMediaScheduler();
}

// 图片任务：等待在途 Promise 决议，成功即回写会话，失败/停止则报错占位
function attachImageCompletion(task) {
  const promise = (state.pendingMediaPromises || new Map()).get(task.taskId);
  if (!promise) { failMediaTask(task, tSync('genPollFailed')); return; }
  promise.then(
    (res) => {
      if (state.mediaStopConvs.has(task.convId)) { failMediaTask(task, tSync('genStopped')); return; }
      if (!res || !res.success) { failMediaTask(task, (res && res.error) || tSync('aiCallFailed')); return; }
      const urls = normalizeImageUrls(res.images);
      if (!urls.length) { failMediaTask(task, tSync('genNoResult')); return; }
      completeImageTask(task, urls, res);
    },
    (err) => { failMediaTask(task, (err && err.message) || tSync('aiCallFailed')); }
  );
}

function ensureMediaScheduler() {
  if (_mediaSchedulerTimer) return;
  _mediaSchedulerTimer = setTimeout(runMediaScheduler, 0);
}

// 从队列移除任务并收尾（完成/失败/取消共用；settled 防止重复处理）
function settleMediaTask(task) {
  if (task.settled) return;
  task.settled = true;
  state.mediaTasks = state.mediaTasks.filter(t => t !== task);
  if (task.mode === 'image' && state.pendingMediaPromises) {
    state.pendingMediaPromises.delete(task.taskId);
  }
  if (!state.mediaTasks.some(t => t.convId === task.convId)) {
    state.mediaActiveConvs.delete(task.convId);
    state.mediaStopConvs.delete(task.convId);
  }
  updateComposerUI();
}

// 原地替换占位气泡为最终内容（含用量/credits footer）
function replaceGenPending(task, html, opts) {
  const wrap = task.domEl;
  if (wrap && wrap.isConnected) {
    wrap.classList.remove('gen-pending');
    const bubble = wrap.querySelector('.bubble');
    if (bubble) {
      bubble.className = 'bubble markdown-body';
      bubble.innerHTML = renderMarkdown(html);
      if (opts && (opts.usage || opts.creditsCost)) {
        const foot = document.createElement('div');
        foot.className = 'token-usage';
        foot.textContent = formatUsageText(opts.usage, opts.creditsCost);
        bubble.appendChild(foot);
      }
    }
    scrollToBottomIfNearBottom();
  }
}

// 失败占位：原地替换为错误提示
function failGenPending(task, errText) {
  const wrap = task.domEl;
  if (wrap && wrap.isConnected) {
    wrap.classList.remove('gen-pending');
    const bubble = wrap.querySelector('.bubble');
    if (bubble) {
      bubble.className = 'bubble error-bubble';
      bubble.innerHTML = `<div class="gen-pending-head"><span class="gen-pending-fail-icon">!</span><span>${escapeHtml(String(errText || tSync('aiCallFailed')))}</span></div>`;
    }
    scrollToBottomIfNearBottom();
  }
}

// 结果写入会话历史 + 刷新列表/标题/用量（视频/图片完成共用）
function commitMediaResult(task, msg) {
  const genConv = state.conversations.find(c => c.id === task.convId);
  if (genConv && Array.isArray(genConv.messages)) {
    genConv.messages.push(msg);
    genConv.title = getConvTitle(genConv.messages);
    genConv.updatedAt = Date.now();
    saveConversations();
    renderConversationList();
    if (state.currentConvId === task.convId) updateConvTitle();
    renderTokenGauges();
    if (state.aiReady) refreshModelMeta();
  }
}

// 视频任务完成：写入会话历史 + 原地替换占位气泡
function completeMediaTask(task, poll) {
  settleMediaTask(task);
  const markdown = `![${tSync('generatedVideo')}](${poll.video_url})`;
  const cost = Number(poll.credits_cost) || 0;
  commitMediaResult(task, {
    role: 'assistant',
    content: markdown,
    video_url: poll.video_url,
    uid: generateId(),
    ts: Date.now(),
    creditsCost: cost,
  });
  replaceGenPending(task, markdown, { creditsCost: cost });
}

// 图片任务完成：写入会话历史（图片 markdown）+ 原地替换占位气泡
function completeImageTask(task, urls, res) {
  settleMediaTask(task);
  const markdown = urls.map(u => `![${tSync('generatedImage')}](${u})`).join('\n\n');
  const cost = Number(res.credits_cost) || 0;
  commitMediaResult(task, {
    role: 'assistant',
    content: markdown,
    images: urls,
    uid: generateId(),
    ts: Date.now(),
    creditsCost: cost,
  });
  replaceGenPending(task, markdown, { creditsCost: cost });
}

// 任务失败：移除任务 + 失败占位气泡
function failMediaTask(task, errText) {
  settleMediaTask(task);
  failGenPending(task, errText);
}

// 轮询一轮所有待处理任务；无任务则停止调度器
async function runMediaScheduler() {
  _mediaSchedulerTimer = null;
  if (!state.mediaTasks.length) return;
  const pending = [...state.mediaTasks];
  for (const task of pending) {
    if (state.mediaStopConvs.has(task.convId)) { failMediaTask(task, tSync('genStopped')); continue; }
    // 图片任务由 Promise 完成回调驱动，不需轮询
    if (task.mode === 'image') continue;
    // 视频生成超时收敛：持续 processing 超过 12 分钟仍无结果则放弃等待（不无限轮询）
    if (Date.now() - (task.startedAt || 0) > 12 * 60 * 1000) {
      failMediaTask(task, tSync('genVideoTimeout'));
      continue;
    }
    const poll = await window.myzone.ai.pollVideo(task.taskId).catch(() => null);
    if (!poll || !poll.success) {
      // 上游查询持续失败则放弃等待（收敛：不无限轮询）
      task.failStreak = (task.failStreak || 0) + 1;
      if (task.failStreak >= 6) failMediaTask(task, tSync('genPollFailed'));
      continue;
    }
    task.failStreak = 0;
    if (poll.status === 'completed') { completeMediaTask(task, poll); continue; }
    if (poll.status === 'failed') { failMediaTask(task, poll.error || tSync('genVideoFailed')); continue; }
  }
  if (state.mediaTasks.length) {
    _mediaSchedulerTimer = setTimeout(runMediaScheduler, 5000);
  }
}


// 菜单展示当前会话可手动使用的技能入口。generative 技能拆成「图片生成/视频生成」
// 两个可直接触发的手动入口；其余已启用的技能以技能标签形式临时附加到本次发送，
// 让模型在当前回复中特意遵循该技能（不改变智能体配置、不持久化）。
let _slashItems = [];    // [{ id, name, desc, kind:'gen'|'skill', mode?, skillId? }]
let _slashFilter = '';

// 供 main.js keydown 判断是否弹出/保持菜单
function slashMenuOpen() {
  const m = $('slash-menu');
  return !!(m && !m.hidden);
}

// 构建菜单项：已启用技能 + generative 展开为图片/视频
function slashBuildItems(filter) {
  const raw = (filter || '').replace(/^\s*\/\s*/, '').toLowerCase();
  const items = [];
  // generative 拆分为图片/视频两个手动入口
  const gen = findSkill && findSkill('generative');
  if (gen) {
    items.push({ id: 'gen-image', kind: 'gen', mode: 'image', name: tSync('manualImageGen'), desc: tSync('skillSelectModel'), genIcon: 'image' });
    items.push({ id: 'gen-video', kind: 'gen', mode: 'video', name: tSync('manualVideoGen'), desc: tSync('skillSelectModel'), genIcon: 'video' });
  }
  // 其它非生成技能（排除 generative / core 锁定技能 / MCP）：全部可手动选用，不做 enable 过滤
  for (const s of SKILL_REGISTRY) {
    if (s.id === 'generative' || s.id === 'core' || s.id === '__mcp__') continue;
    const nm = getSkillName(s);
    items.push({ id: s.id, kind: 'skill', skillId: s.id, name: nm, desc: tSync(s.descKey) || '' });
  }
  if (raw) {
    return items.filter((it) => it.name.toLowerCase().includes(raw) || it.desc.toLowerCase().includes(raw));
  }
  return items;
}

// 打开/刷新菜单（须在 non-empty 时始终调用以保持同步）
function slashOpen(filter) {
  _slashFilter = filter || '';
  _slashItems = slashBuildItems(_slashFilter);
  const m = $('slash-menu');
  if (!m) return;
  if (!_slashItems.length) {
    m.hidden = true;
    return;
  }
  m.hidden = false;
  m.innerHTML = '';
  const head = el('div', 'slash-menu-title', escapeHtml(tSync('skillLabel')));
  m.appendChild(head);
  for (let i = 0; i < _slashItems.length; i++) {
    const it = _slashItems[i];
    const row = el('div', 'slash-menu-item' + (i === 0 ? ' active' : ''), '', i);
    const icon = it.kind === 'gen'
      ? (it.mode === 'image' ? SVG_IMAGE : SVG_VIDEO).replace('class="sc-icon"', 'class="smi-icon"')
      : '<svg class="smi-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    row.innerHTML = icon
      + `<span class="smi-name">${escapeHtml(it.name)}</span>`
      + (it.desc ? `<span class="smi-desc">${escapeHtml(it.desc)}</span>` : '');
    row.addEventListener('click', () => { slashClose(); slashApply(it); });
    row.addEventListener('mousemove', () => slashSetActive(i));
    m.appendChild(row);
  }
}

// 根据输入当前值决定菜单开关（input 事件调用）
function slashFilter() {
  const val = inputEl().value;
  // 仅当整行以 / 开头且后面是纯过滤词时显示（不在句中、不干扰正常输入）
  if (!/^\s*\//.test(val)) { slashClose(); return; }
  const term = val.replace(/^\s*\//, '');
  // 过滤词含空格则视为已完成输入，关闭
  if (/\s/.test(term)) { slashClose(); return; }
  slashOpen(term);
}

// 当前选中索引
function _slashActive() {
  const m = $('slash-menu');
  if (!m) return 0;
  const rows = m.querySelectorAll('.slash-menu-item');
  for (let i = 0; i < rows.length; i++) if (rows[i].classList.contains('active')) return i;
  return 0;
}
function slashSetActive(i) {
  const m = $('slash-menu');
  if (!m) return;
  const rows = m.querySelectorAll('.slash-menu-item');
  for (let j = 0; j < rows.length; j++) rows[j].classList.toggle('active', j === i);
}
function slashMove(dir) {
  if (!_slashItems.length) return;
  const cur = _slashActive();
  const next = (cur + dir + _slashItems.length) % _slashItems.length;
  slashSetActive(next);
}
// 回车/Tab 确认当前选中项
function slashPick() {
  if (!_slashItems.length) return;
  const it = _slashItems[_slashActive()];
  slashClose();
  slashApply(it);
}
function slashClose() {
  const m = $('slash-menu');
  if (m) m.hidden = true;
}

// 应用选中项：gen → 激活生成技能；其它 → 以暂态标签形式附加技能并发送。
// 无论哪种，选中后都清空输入框（/ 不残留），生成技能/暂态标签统一显示在技能条上。
async function slashApply(item) {
  const text = inputEl().value.replace(/^\s*/, '').replace(/^\/[^\s]*\s*/, '').trim();
  inputEl().value = '';
  autoGrow();
  inputEl().focus();
  if (item.kind === 'gen') {
    await activateSkill(item.mode);
    return;
  }
  // 非生成类技能：先以暂态标签加入技能条（注入提示），若有正文再随正文一起发送
  addTransientSkill(item.skillId);
  if (text) {
    await sendUserMessage(text);
  }
}
