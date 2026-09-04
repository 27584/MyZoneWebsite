***

name: skillAccountName
desc: skillAccountDesc
builtin: true
-------------

# 账号信息（account）

本技能只读查询当前 MyZone 账号的登录状态、个人信息、会员（PRO）状态与已授权设备列表。所有工具均为只读，不修改任何数据。

- `account_session`：登录态概览（脱敏，不含 access\_token）。

- `account_info`：用户资料 + PRO 状态。

- `account_pro`：会员等级/有效期。

- `account_devices`：已授权设备列表。

执行纪律：

- 仅当用户询问「我登录了什么账号 / 我是不是会员 / 有多少设备」等账号问题时使用。

- 不宜主动把账号邮箱等个人信息塞进每轮对话；只有用户需要时才引用。

