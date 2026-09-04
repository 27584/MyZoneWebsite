// myzone.ai-assistant / tools/script.js（网页版）
// 工具实现（技能 'script'）：执行 JavaScript。
// 网页端（浏览器，叠加 ZoneMind）只有隔离沙箱形态：在 Worker 中运行，无 DOM / 无 window.myzone / 无网络，仅纯计算。
// 提示词在 skills/script/skill.md。

'use strict';

const JS_SANDBOX_TIMEOUT_MS = 15000; // 沙箱执行上限（Worker 可被终止）
const JS_RESULT_LIMIT = 6000;        // 结果字符串截断长度

// 把任意返回值转成一个可回填上下文的紧凑文本（幂等、防循环、截断）。
function wsScriptSerialize(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return '[function ' + (value.name || 'anonymous') + ']';
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'bigint') return value.toString();
  let text;
  if (typeof value === 'string') {
    text = value;
  } else if (value && typeof value === 'object') {
    const seen = new WeakSet();
    try {
      text = JSON.stringify(value, (k, v) => {
        if (typeof v === 'function' || typeof v === 'undefined' || typeof v === 'symbol') return void 0;
        if (typeof v === 'bigint') return v.toString();
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      }, 2) ?? 'null';
    } catch (e) {
      text = '[不可序列化: ' + (e && e.message || '') + ']';
    }
  } else {
    text = String(value);
  }
  if (text.length > JS_RESULT_LIMIT) return text.slice(0, JS_RESULT_LIMIT) + '\n…(结果过长已截断)';
  return text;
}

// ========== run_script：隔离 Worker 沙箱（无 DOM / 无 myzone / 无网络） ==========
// Worker 通过 Blob 就地创建，无需额外文件；只有纯计算能力，安全、无需确认。
registerTool({
  name: 'run_script',
  skillId: 'script',
  labelKey: 'toolRunJsSandbox',
  description: 'Execute a JavaScript snippet in an ISOLATED Worker sandbox. The code has NO access to the page DOM, browser automation, or network - it can only do pure computation (data processing, math, algorithms). Safe, no confirmation needed. Use `return <expression>;` to produce a result; returning a Promise is awaited (up to 15s).',
  parameters: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'The complete JavaScript code to execute. End with `return <expression>;` to produce a result; may return a Promise (awaited).' },
    },
    required: ['script'],
  },
  async handler(args) {
    const script = String(args && args.script || '').trim();
    if (!script) return { success: false, error: '待执行的 JS 代码为空' };

    const runner = [
      "'use strict';",
      "function safeJson(v){try{return JSON.stringify(v,function(k,x){if(typeof x==='function'||typeof x==='undefined'||typeof x==='symbol')return void 0;if(typeof x==='bigint')return x.toString();return x;},2)??'null'}catch(e){return '[不可序列化: '+e.message+']'}}",
      'self.onmessage=async function(ev){',
      "  try{",
      '    var wrapped="(async () => {\\n"+ev.data+"\\n})();',
      '    var v=await new Function("return "+wrapped)();',
      '    var text=(typeof v==="string")?v:safeJson(v);',
      '    self.postMessage({ok:true,value:text});',
      "  }catch(e){",
      '    self.postMessage({ok:false,error:String((e&&e.message)||e)});',
      '  }',
      '};',
      'self.postMessage({ok:true,ready:true});',
    ].join('\n');

    const blob = new Blob([runner], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    return await new Promise((resolve) => {
      const finish = (result) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(result);
      };
      worker.onmessage = (ev) => {
        const d = ev && ev.data || {};
        if (d.ready) { worker.postMessage(script); return; }
        finish(d.ok ? { success: true, result: wsScriptSerialize(d.value) } : { success: false, error: String(d.error || '执行出错') });
      };
      worker.onerror = (e) => finish({ success: false, error: '沙箱执行出错：' + ((e && e.message) || '未知错误') });
      const timer = setTimeout(() => finish({ success: false, error: '执行超时（' + Math.round(JS_SANDBOX_TIMEOUT_MS / 1000) + ' 秒）' }), JS_SANDBOX_TIMEOUT_MS);
    });
  },
  resultLines: (args, r) => {
    if (!r || !r.success) return [{ k: tSync('toolFailed'), v: String(r && r.error || '') }];
    return [{ k: tSync('toolScriptResult'), v: String(r.result || '') }];
  },
});