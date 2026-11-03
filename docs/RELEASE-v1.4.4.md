# v1.4.4 · 小米第三方授权入口与子账号身份隔离

> 本版修正小米官方网页登录没有真正打开 QQ / 微信等第三方入口的问题，补齐 OPPO 多角色从选择到兑换的端点级测试，并修复同一渠道父账号下多个小号的账号记录合并风险。多小号真实账号端到端验证仍受测试条件限制。

## 术语与身份隔离

- “多开”是同时打开多个标签页或窗口，每个窗口可以登录不同父账号；它不等于同一父账号下绑定多个小号。
- “小号”在本项目中指同一 OPPO / Vivo 父账号下由官方响应列出的多个游戏子账号，例如两个 `ssoid` 或两个 `subOpenId`。
- `1.4.4` 以用户实际选中的 OPPO `ssoid` 或 Vivo `subOpenId` 生成稳定、不直接暴露原始子账号 ID 的 16 位十六进制指纹，并把指纹保存在账号记录中；原始子账号 ID 不写入账号簿。
- 两个小号即使最终得到相同的 `grant.account`，也会得到不同 profile 和不同恢复会话，不再合并为一条账号记录。同一小号重复登录仍复用原 profile。
- 从旧版升级时，明确选中的旧 profile 可以原地写入新指纹；之后选择另一个小号会被识别为冲突，必须通过“添加账号”或明确的账号切换流程继续，避免把 B 的角色资料写入 A。
- 新授权的 OPPO / Vivo 凭证会等到主机确认 `ready` 事件中的子账号身份后再保存。若用户先选中 A、又在官方页换成 B，冲突处理会先终止引擎流程，不会把 B 的恢复票据提前写入 A。

## 小米标准登录入口

- 旧配置直接打开 `https://account.xiaomi.com/oauth2/authorize`。该页只展示小米账号密码、手机号和扫码，不会展示 QQ / 微信等第三方入口。
- 新配置使用 `https://id.mi.com/` 作为官方标准登录入口，由 `ChannelCore.authorization()` 自动附加：
  - `sid=passport`
  - 完整的 `callback=<OAuth authorize URL>`
- 官方 OAuth 参数保持不变：`client_id=2882303761517516898`、`response_type=code`、`scope=1 3`、`redirect_uri=http://game.xiaomi.com/oauthcallback/mioauth`、随机 `state`、`skip_confirm=false`。
- 页面实测：标准登录页显示 QQ、微信、微博、支付宝；点击 QQ 后进入 `graph.qq.com/oauth2.0/authorize`，随后显示 QQ 快捷授权页。回跳参数在小米登录页与 QQ 授权请求中均保持完整。

### 验证边界

- 本次没有自动点击 QQ 头像完成授权，也没有读取或输出 QQ / 小米票据。
- 真实第三方授权、后续小米 SDK 会话和游卡兑换仍需账号本人在官方页面完成。

## OPPO 多角色

- `userDto.userId` 与 `gameAccounts[].userId` 改为字符串归一化比较，避免官方响应字段类型不一致时把本人角色误判为不属于当前账号。
- 新增完整链路测试：
  1. 官方 `gameAccounts` 返回两个可用角色；
  2. 用户选择第二个 `ssoid`；
  3. `exchangeOppoGameAccount()` 返回所选角色；
  4. `exchangeOppoGrant()` 将该 `ssoid` 写入 AnySDK `data.uid`；
  5. 最终 `grant.account` 随选择变化。
- 仍然只展示当前账号本人、同一三国杀包且没有共享、人脸、登录弹窗、保护或交易限制标记的角色。

## Vivo 小号

- 保留 `1.4.3` 的行为：列出全部未冻结小号，将用户选择的 `subOpenId` 交给 `/h5/union/use`。
- 账号恢复继续要求精确匹配原 `subOpenId`，不会自动改用其他小号。
- 恢复成功后会保留所选小号昵称；身份判断仍使用 `subOpenId`，不依赖可能变化的显示名称。

## 与“锦囊妙计”客户端的差异

- 当前参考客户端版本为 `26.0.36`，`app.asar` SHA-256 为 `4BA79A4CDFCF775B863DACE48C06CF13A580E8ABB8B5704B54C4C8ED6ED4D007`。
- “锦囊妙计”通过每个槽位独立的 `persist:jinnangdai-${channel}-${slot}` 分区保存不同标签页会话，适合并列打开多个父账号；这是多开会话隔离，不是同一父账号下的子账号选择器。
- 该版本内置 `unified-login.user.js`（SHA-256 `0057CDD1AAE77E878FC71E790A79B7D94C1C09644B05978856025EF7A1AA0C06`）仍要求 OPPO `gameAccounts` 恰好一项、Vivo 只有一个 `lastLogin=true` 子账号，因此不能把它当作“同一父账号下多个小号已实证支持”的依据。
- 其“账号簿”保存官网登录账号和密码，不是渠道子账号选择记录。当前打包版本的静态代码中没有同一父账号下多个 OPPO / Vivo 子账号的选择逻辑。
- 本插件使用共享账号簿加按 profile 隔离的会话存储；OPPO / Vivo 的多子账号选择与身份隔离由本插件单独实现。

## 验证

- `npm test`：38 项回归测试全部通过。
- `tests/_test_xiaomi_login_entry.js`：15 项检查覆盖标准入口、`sid`、完整 callback、state 和 OAuth 参数。
- `tests/_test_account_choice.js`：覆盖 OPPO 选择第二个 `ssoid` 后的 AnySDK `uid`、票据、最终账号以及 Vivo 选择链路。
- `tests/_test_subaccount_identity.js`：28 项检查覆盖共享 `grant.account`、同一子账号重复登录、指纹查找、旧记录迁移、选错子账号拦截、超长 ID 哈希、账号簿双记录、Vivo 恢复昵称、“添加账号”清理旧绑定，以及冲突前不得提前保存兄弟子账号凭证。
- `_direct_engine.js` 与 `三国杀多渠道登录.user.js` 均通过 `node --check`；内嵌引擎已同步。

## 已知限制

- 没有可用的真实“同一渠道父账号下多个小号”账号完成端到端实机登录，因此不能声称多小号已在真实服务器上实证。当前结论仅来自官方响应结构、代码级链路测试和端点级测试。
- 最终能否登录仍由渠道服务器、游卡服务器、账号状态、实名与风控结果共同决定；本版不绕过任何官方校验。

## 安装或升级

- 下载构建产物中的 `三国杀多渠道登录.user.js`，在 Tampermonkey 中覆盖安装。
- 安装后刷新登录页，页脚应显示 `v1.4.4 · 9 个渠道`。
- 不要同时启用旧版统一登录器或其他会向同一页面注入登录面板的脚本。
