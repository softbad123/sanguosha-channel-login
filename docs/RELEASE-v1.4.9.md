# v1.4.9 · OPPO 缺失包名兼容修复

> 本版修复部分 OPPO 双角色账号完成官方登录后直接报 `OPPO_GAME_PACKAGE_MISMATCH`、无法进入游戏的问题。

修复方向由 [@lkfun](https://github.com/lkfun) 提交，并已与原反馈者完成联调；维护者补充正式用户脚本同步、异常条目保护和回归测试。

## 问题

- 旧逻辑要求 `gameAccounts[]` 中每个账号都返回 `pkgName === 'com.sgs10th.nearme.gamecenter'`。
- 部分 OPPO 响应没有返回 `pkgName`，或返回 `null`、空字符串、纯空白，导致本人三国杀角色被全部过滤。
- 登录请求本身已经固定为 `pkgName=com.sgs10th.nearme.gamecenter`，因此缺失包名不应被当作其他游戏。

## 修复

- 缺失、`null`、空字符串和纯空白的 `pkgName` 现在按本次 OPPO 请求的包名作用域处理。
- 仍只接受当前 OPPO 用户本人，并继续过滤共享、人脸校验、登录弹窗、保护或交易限制角色。
- `null` / `undefined` 账号条目和非字符串包名会被安全忽略，不会在后续读取 `userId` 时崩溃。
- 正式用户脚本中的内嵌引擎已同步，安装后页脚会显示 `v1.4.9 · 9 个渠道`。

## 自动更新

- 脚本元数据、宿主和引擎版本均为 `1.4.9`。
- 固定更新地址保持为 `https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js`。
- 已安装旧版的用户可由 Tampermonkey 自动检查更新，也可以在 Tampermonkey 管理面板手动执行“检查脚本更新”。
- Release 同时提供带版本号的 `sanguosha-channel-login-1.4.9.user.js`，内容与固定更新资产一致。

## 测试记录

- 扩展 `tests/_test_account_choice.js`，覆盖 `undefined`、`null`、空字符串、纯空白包名，以及畸形账号条目和非字符串包名。
- OPPO 账号选择测试共 37 项逻辑检查通过。
- `npm test`：41 项回归测试全部通过。
- `node --check _direct_engine.js` 与 `node --check 三国杀多渠道登录.user.js` 通过。
- `npm run sync:engine` 已同步主脚本中的嵌入引擎，元数据、宿主版本和引擎版本均为 `1.4.9`。
- 作者与原反馈者在真实 OPPO 双角色账号场景完成联调验证。

## 验证边界

- 本版只放宽缺失包名的匹配逻辑，不改变 OPPO 授权、AnySDK 票据兑换、账号选择、实名或风控流程。
- 其他游戏包名仍会被过滤；非字符串包名不会继承请求作用域。
- 若官方后续再次改变 `gameAccounts` 结构，异常响应会明确失败，不会自动猜测角色。

## 安装或升级

- 已安装旧版：在 Tampermonkey 中检查更新，或重新打开固定更新地址覆盖安装。
- 新安装：下载 Release 中的 `sanguosha-channel-login.user.js`，在 Tampermonkey 中导入并启用。
- 安装后刷新登录页，页脚应显示 `v1.4.9 · 9 个渠道`。
- 不要同时启用旧版统一登录器或其他会向同一页面注入登录面板的脚本。
