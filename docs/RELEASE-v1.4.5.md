# v1.4.5 · 小米登录热修复

> 本版修复 `1.4.4` 引入的小米直登回归：已有小米登录态的用户点击“小米官方网页登录”后会进入账号管理页，无法继续游戏授权。默认入口恢复直接 OAuth，QQ / 微信等第三方登录改为独立入口。

## 问题与根因

- `1.4.4` 将默认入口改为 `https://id.mi.com/`，并附加 `sid=passport` 与完整 OAuth `callback`。
- 该入口在未登录时显示标准登录页；已有小米登录态时会跳转到 `account.xiaomi.com/fe/service/account` 账号管理页，原 `callback` 被丢弃。
- 因此修复本应解决的“第三方入口”问题，反而使已登录用户无法完成游戏授权。
- 标准登录页上的 QQ 按钮还会把 `callback` 包装成账号安全主页的 STS 回跳，不能作为游戏 OAuth 的通用入口。

## 修复方式

- “小米官方网页登录”恢复为直接打开 `https://account.xiaomi.com/oauth2/authorize`，不再请求二级登录页。已有登录态可以直接完成授权。
- 新增独立的“QQ / 微信第三方登录”入口，使用 `https://account.xiaomi.com/pass/serviceLogin`，并携带：
  - `sid=passport`
  - 完整 `callback=<OAuth authorize URL>`
  - 随机 `state`
- 匿名访问该标准登录页会显示 QQ、微信、微博、支付宝入口；点击 QQ 后发出的 `/pass/sns/login/auth` 请求仍携带完整 OAuth `callback`。
- 面板状态文字明确区分直接授权与第三方标准登录页。若第三方页显示账号管理页，会提示返回并使用“小米官方网页登录”。

## 回归约束

- `tests/_test_xiaomi_login_entry.js` 校验默认调用不生成二级登录入口，只有显式请求第三方入口时才生成。
- 第三方入口必须是 `account.xiaomi.com/pass/serviceLogin`，并保留完整 OAuth `callback` 与 `state`。
- `tests/_test_login_options.js` 校验默认“小米官方网页登录”使用 method 1、第三方选项使用 method 2 且单独标记；禁止重新使用会丢失 `callback` 的 `id.mi.com`。

## 验证边界

- 已通过无痕浏览器核对匿名标准登录页的 QQ / 微信按钮，以及 QQ 授权请求中的完整 OAuth `callback`。
- 未替用户完成真实 QQ / 微信账号授权，也未读取或输出任何渠道票据。
- 第三方授权后的最终小米 OAuth 回跳仍需账号本人完成一次真实登录验证；默认直登路径已恢复为 `1.4.3` 的已验证行为。

## 安装或升级

- 下载 Release 中的 `三国杀多渠道登录.user.js`，在 Tampermonkey 中覆盖安装。
- 安装后刷新登录页，页脚应显示 `v1.4.5 · 9 个渠道`。
- 不要同时启用旧版统一登录器或其他会向同一页面注入登录面板的脚本。
