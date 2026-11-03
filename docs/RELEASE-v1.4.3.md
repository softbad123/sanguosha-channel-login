# v1.4.3 · 多角色选择与小米第三方授权说明

> 本版修复 OPPO、Vivo 账号下存在多个游戏角色或小号时无法继续登录的问题，并明确小米官方网页登录对已绑定 QQ、微信等第三方授权的兼容方式。

## 本版更新

### OPPO 多角色

- 不再要求 OPPO `gameAccounts` 响应只能包含一个游戏账号。
- 仅保留当前 OPPO 用户本人、包名为 `com.sgs10th.nearme.gamecenter`、且没有共享、人脸校验、登录弹窗、保护或交易限制标记的角色。
- 多个可用角色会在游戏页显示明确的选择弹窗；用户确认后才把所选角色 ID 作为 `ssoid` 继续兑换，不会自动取第一项。
- 单个可用角色仍自动继续，保持原有快速登录体验。

### Vivo 小号

- 不再要求 Vivo 子账号列表只能有一个，也不再要求唯一的子账号必须标记为最近登录。
- 全部未冻结小号都会进入选择器；冻结账号不会展示，全部不可用时给出可操作的错误提示。
- 用户选中的 `subOpenId` 会随 `extraInfo` 一起提交到官方 `/h5/union/use`，后续 AnySDK 会话使用该小号的临时凭证。
- 本地保存的账号直登仍按原 `subOpenId` 精确恢复；若该小号不存在或已冻结，会安全失败，不会自动改用其他小号。

### 小米官方 OAuth

- 对照参考实现确认其官方登录入口为 `https://account.xiaomi.com/oauth2/authorize`，参数为 `client_id`、`response_type=code`、`scope=1 3`、固定回跳地址、随机 `state` 和 `skip_confirm=false`。
- 现有可见选项继续采用该入口，并提示小米官方页面上的 QQ、微信等已绑定第三方授权；移除了未使用的备用 `pass/serviceLogin` 授权入口配置，避免误以为脚本需要另造第三方登录链路。
- 本项是官方授权入口与说明对齐，不属于多账号响应列表修复，也不绕过小米账号绑定或风控。

### 共用账号选择器

- OPPO 与 Vivo 共用一套延迟创建的选择器，不为单个渠道复制登录流程。
- 选择器使用 closed Shadow DOM 和 `textContent`，不把提供方返回文本当 HTML；账号 ID 只显示掩码后缀。
- 支持方向键、Home、End、Tab 焦点循环、`Esc`、遮罩与取消按钮；取消会清理弹窗并终止本次流程。
- 重复账号 ID 会在渲染前被拒绝，避免用户选择与实际票据不一致。

## 搜索与渠道结论

- GitHub issue #1 的日志确认 OPPO 多角色路径返回 `oppo_game_account` 失败，原因是旧实现要求账号数恰好为一。
- Vivo 官方前端资源包含“小号功能介绍”以及 `subAccounts`、`subMax`、`subOpenId`、`frozenFlag`、`lastLogin` 等字段，确认存在同类多小号场景。
- 公开 issue 与线上资源中未确认华为、荣耀、小米、哔哩哔哩、Steam、WeGame、应用宝存在相同的多账号响应结构，因此本版没有为这些渠道虚构账号选择分支。

## 验证

- `npm test`：36 项回归测试全部通过。
- `tests/_test_account_choice.js`：17 项断言覆盖单账号自动选择、多账号显式选择、OPPO/Vivo 安全过滤、掩码、Vivo 选中 UID 下发及取消清理。
- `_direct_engine.js` 与 `三国杀多渠道登录.user.js` 均通过 `node --check`，内嵌引擎已由 `npm run sync:engine` 同步。

## 安装或升级

- 下载 [`sanguosha-channel-login.user.js`](https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js)，在 Tampermonkey 中覆盖安装。
- 安装后刷新登录页，页脚应显示 `v1.4.3 · 9 个渠道`。
- 不要同时启用旧版统一登录器或其他会向同一页面注入登录面板的脚本。

## 已知限制

- OPPO/Vivo 的多账号分支依据公开 issue、官方前端字段和回归测试实现；仍建议使用实际多角色账号完成一次真实登录验证。
- 最终能否登录仍由渠道服务器、游卡服务器、账号状态、实名与风控结果共同决定；本版不绕过任何官方校验。
