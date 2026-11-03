# v1.4.6 · 小米 QQ / 微信第三方授权修复

> 本版修复 `1.4.5` 留下的小米第三方登录问题：已有小米登录态的浏览器点击 QQ / 微信后仍可能进入小米账号管理页，原游戏 OAuth 回调丢失。`1.4.6` 不再经过 `pass/serviceLogin`，直接从服务端签名回调进入官方 SNS 授权。

## 根因

- `1.4.5` 的“QQ / 微信第三方登录”仍打开 `https://account.xiaomi.com/pass/serviceLogin`。
- 已有小米登录态时，该页面会优先进入 `account.xiaomi.com/fe/service/account` 账号管理页，游戏 OAuth 请求被截断。
- 用户提供的参考脚本中，“登录方式二”同样使用 `pass/serviceLogin`，所以直接沿用它并不能解决已有登录态场景。
- 小米官网自身的第三方登录在内部使用 `/pass/sns/login/auth`，但它需要服务端签名的 STS 回调，不能只传原始游戏 OAuth URL。

## 修复方式

- 在 `https://account.xiaomi.com/oauth2/authorize` 的正常游戏 OAuth 参数后附加：
  - `_json=true`：让服务端返回登录挑战 JSON，而不是先跳账号管理页。
  - `sgs_sns=qq|weixin`：仅作为脚本桥接标记。
- 新增 `account.xiaomi.com` 桥接页，只在上述带标记的 OAuth 页面运行；普通小米账号页不注入三国杀面板。
- 桥接校验固定游戏客户端 `2882303761516898`、回调 `http://game.xiaomi.com/oauthcallback/mioauth`、`response_type=code` 和 32 位 `state`。
- 请求 `_json=true` 后解析 `&&&START&&&` 响应，并要求：
  - `code=70016`、`result=login`、`data.sid=oauth2.0`；
  - 回调来源必须是 `https://account.xiaomi.com/sts/oauth`；
  - 回调带有非空签名，且 `followup` 中的客户端、回调地址、scope、`state` 与本次请求完全一致。
- 用签名回调构造 `/pass/sns/login/auth`：
  - QQ：`appid=100284651`；
  - 微信：`appid=wxxmzh`、`scope=snsapi_login`。
- 如果已有小米登录态使第一次请求返回账号页或已授权跳转，桥接自动用 `credentials: omit` 再取一次登录挑战；不会删除或修改现有 Cookie。
- 登录页在弹窗打开前把本次请求按随机 `state` 写入 Tampermonkey 临时存储；即使小米服务端先把窗口 302 到账号页，桥接也能通过窗口名找回同一请求并继续。记录在成功或失败后立即删除。
- “QQ 登录”和“微信登录”拆成两个面板按钮，避免用户再看到标准登录页或账号管理页。
- 直登引擎的同源检查提前到读取 `unsafeWindow` 之前，桥接页不会启动无关的游戏引擎。

## 验证记录

- `npm test` 回归覆盖入口参数、回调校验、JSON 解析和第三方 `appid`。
- 无痕浏览器实测 QQ 最终到达：
  - `https://graph.qq.com/oauth2.0/show?...&client_id=100284651...`
- 无痕浏览器实测微信最终到达：
  - `https://open.weixin.qq.com/connect/qrconnect?...`
- 模拟“已有登录态返回 302 账号页”后，无 Cookie 降级路径仍到达 QQ 官方授权页。
- 普通 `account.xiaomi.com` 页面不会出现三国杀登录面板。
- 面板“小米官方网页登录”仍保持直接 OAuth，不附加 `_json` 或 `sgs_sns`。

## 验证边界

- 未替用户扫码或填写 QQ / 微信账号，未读取任何密码、验证码、Cookie 或授权码。
- 第三方扫码成功后的小米回调、SDK 会话兑换和最终进入游戏，需要账号本人完成一次真实登录后确认。
- 如果真实扫码后仍失败，请保留“运行记录”并反馈最后 URL 所处的域名阶段；不要发送密码、验证码或完整授权链接。

## 安装或升级

- 下载 Release 中的 `sanguosha-channel-login.user.js`，在 Tampermonkey 中覆盖安装。
- 安装后刷新登录页，页脚应显示 `v1.4.6 · 9 个渠道`。
- 不要同时启用旧版统一登录器或其他会向同一页面注入登录面板的脚本。
