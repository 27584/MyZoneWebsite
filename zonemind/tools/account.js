// myzone.ai-assistant / tools/account.js
// 工具实现（技能 'account'）：只读查询当前 MyZone 账号信息、会员状态与设备列表。
// 提示词在 skills/account/skill.md。这里只放可调用函数与 schema。

'use strict';

// account.* 返回结构不统一（有 {success,...} 有裸对象），统一展平为可读文本。
function a_normalize(res) {
  if (!res) return '（无返回）';
  if (typeof res !== 'object') return String(res);
  return JSON.stringify(res, null, 2);
}

registerTool({
  skillId: 'account',
  name: 'account_info',
  
  labelKey: 'toolAccountInfo',
  description: 'Get the current MyZone account info: user profile and PRO membership status. Use to answer questions about who is logged in or membership level.',
  parameters: { type: 'object', properties: {} },
  async handler() {
    return { success: true, info: a_normalize(await window.myzone.account.getInfo()) };
  },
});

registerTool({
  skillId: 'account',
  name: 'account_pro',
  
  labelKey: 'toolAccountPro',
  description: 'Check the current account\'s PRO membership status (is PRO, expiry, plan).',
  parameters: { type: 'object', properties: {} },
  async handler() {
    return { success: true, pro: a_normalize(await window.myzone.account.checkPro()) };
  },
});

registerTool({
  skillId: 'account',
  name: 'account_devices',
  
  labelKey: 'toolAccountDevices',
  description: 'List the devices authorized on the current MyZone account.',
  parameters: { type: 'object', properties: {} },
  async handler() {
    return { success: true, devices: a_normalize(await window.myzone.account.getDevices()) };
  },
});

registerTool({
  skillId: 'account',
  name: 'account_session',
  
  labelKey: 'toolAccountSession',
  description: 'Get the current login session overview (desensitized, no access token). Shows login state and basic identity.',
  parameters: { type: 'object', properties: {} },
  async handler() {
    return { success: true, session: a_normalize(await window.myzone.account.getSession()) };
  },
});