# v1.3.0 · 游戏内 ID、账号直登与面板折叠修复

> 本 Release 的说明和安装包已刷新为 2026-10-21 的最终版本，脚本版本号仍为 `1.3.0`。
>
> 如果你此前已经安装过早期 `1.3.0`，自动更新不会把这次同版本刷新识别为新版本。请从本页下载安装包并在 Tampermonkey 中覆盖安装，确保用上最终修复。

## 安装或升级

- 下载 [`sanguosha-channel-login.user.js`](https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js)，在 Tampermonkey 中导入或覆盖安装。
- 建议使用 Tampermonkey `5.5.1` 或更新版本。安装后刷新三国杀登录页，页脚应显示 `v1.3.0 · 多渠道本地版 · 7 个渠道`。
- 不要同时启用旧的统一登录器、小米服登录器，或其他会向同一页面注入登录面板的脚本。
- 源码、使用说明和问题排查见 [`main` 分支 README](https://github.com/softbad123/sanguosha-channel-login#readme)。

## 本版重点

- 游戏内 ID 改为从游戏自身的 `UserData.Self.UserBrief.userID` 读取，并兼容加载较晚、脚本注入入口不同和字段分次到达的情况。
- 修复账号管理快捷登录反复要求重新扫码或重新验证的问题，覆盖 `waiting / loading / failed / disconnected` 状态以及跨游戏路由恢复。
- 重新梳理主登录页的展开与折叠逻辑：主登录页默认展开，官服原生账号选择器不再干扰渠道插件，真实登录成功后必定自动折叠。
- 反馈日志收紧为 3 个会话、3 天、80 条、约 48 KiB，避免长期使用后持续堆积。
- 手动检查更新发现新版本时，直接打开固定 Release 资产地址；没有新版本时只提示已是最新版本。
- 账号列表、诊断页和折叠标题栏同步优化，并补齐针对身份探针、会话恢复、折叠状态和页面卸载清理的回归测试。

## 相对 v1.2.0 的完整变化

### 游戏内 ID 与账号资料

- 游戏内 ID 不再以 `AccountInfo.Self.UserId` 作为首选，改为读取游戏角色资料 `UserData.Self.UserBrief.userID`；只有角色资料缺失时才使用 `AccountInfo` 中的兼容字段。
- 身份探针注入游戏自身的 `Sgs` 闭包，因此能直接访问 `AccountInfo`、`UserData` 和协议对象，不再依赖页面外部无法解析的闭包变量。
- 同时覆盖 `page.scriptContent`、脚本元素 `text`、`CRespLogin`、`notifyUserData` 和协议回调等入口；即使油猴脚本在主游戏脚本之后才执行，也会在资料就绪后继续回填。
- 身份读取会缓存最后一次完整结果。后续只返回区服、账号等部分字段时，会与缓存合并，不会把已有 `userID` 或角色名覆盖为空。
- 小米渠道同步使用同一套角色资料优先逻辑，避免把渠道账号 ID 误显示为游戏内 ID。
- 账号列表统一为 `游戏内 ID · 账号 · 区服备注 · 上次登录时间`。缺失字段自动省略，不再显示空分隔符或“尚未读取”占位。
- 区服默认隐藏，仅在账号备注 `zoneNote` 存在时显示 `区服备注：…`；WeGame 的 QQ、微信等通道可用备注区分，不再出现“区服未同步 / 区服未记录”。
- 账号选择改为整行高亮的可访问列表，支持鼠标、方向键、Home 和 End；账号详情会显示角色名、渠道、账号尾号和最近登录方式。

### 账号管理与快捷直登

- 账号已经绑定，但当前标签仍处于 `waiting / loading / failed / disconnected` 时，点击“直接登录所选账号”会重新恢复本地登录，而不是误判为“这里就是该账号的游戏窗口”。
- 只有在当前窗口确实处于 `connected` 且已经完成启动交接时，才显示“这里就是该账号当前的游戏窗口”，避免快捷登录按钮被错误禁用。
- 已保存的渠道会话可在 `/x/pc/`、`/10/pc/`、`/10th/pc/`、`/login/pc/` 等游戏路由直接走一次性交接，不再依赖渠道页可能不存在的中间登录页。
- 从账号管理跨渠道打开游戏时，会先切换到账号所属渠道并复用已保存的官方会话，不再要求重新扫码或重新输入账号密码。
- 开启“保存本次登录信息”时，成功恢复会刷新本地会话记录的更新时间，避免旧记录持续抢占 `savedSession()`，导致快捷登录时好时坏；恢复失败仍保留账号条目，便于重新授权。
- 关闭保存开关时不会新增或更新可恢复会话；移除账号记录时，会同步清理该账号名下保存的恢复会话。
- 页面卸载时集中清理账号刷新、资料同步、登录轮询、窗口 presence、事件监听器和临时授权键；单个清理步骤失败不会阻断后续清理。

### 主登录页与面板折叠

- 主登录页默认展开渠道登录面板，解决每次刷新进入都先看到折叠标题栏、必须先手动展开的问题。
- 登录页新增持久化选项“主登录页自动展开”。关闭后，主登录页沿用上次折叠状态；重新开启会立即展开。设置保存在 Tampermonkey 本地存储中。
- 官服原生账号选择器只代表官服登录态。`#selectGame`、`.account-box` 的显示、刷新或账号切换不再触发渠道插件折叠，也不会因为官服账号已登录而提前收起面板。
- 插件渠道登录成功、读取到游戏账号资料、点击官服“进入游戏”或进入游戏页后，面板会折叠为 208px 紧凑标题栏。
- 手动展开不会再写入“已自动折叠”标记，因此不会屏蔽下一次真实登录成功后的折叠。
- “隐藏”与“折叠”保持独立：隐藏后可从油猴菜单重新显示；折叠后标题栏仍保留“展开”入口。

### 日志保留、诊断与隐私

- 反馈日志保留策略从 `1.2.0` 的 240 条、30 天、约 96 KiB 收紧为最近 3 个会话、最长 3 天、最多 80 条、约 48 KiB。
- 旧日志、超出容量或超过会话数的记录会在写入和读取时滚动清理，长期使用不会无限堆积。
- 诊断记录包含 `traceId`、流程、阶段、错误码、HTTP 状态、渠道、异常类型、源码文件、行列号、主堆栈及最多四层 `cause` 链。
- 登录恢复、重试、回调、启动交接、身份探针和自动折叠异常都会主动入库；直登引擎与宿主共用同一个 `traceId`，便于串联一次完整流程。
- 增加已知游戏/音频运行时噪声过滤，避免 `AgoraRTC` 等与登录无关的报错挤占有限的日志容量。
- 日志存储损坏或写入失败时回退到页内内存缓冲，当前页面仍可复制或导出；URL 查询串、授权码、token、ticket、Cookie、Bearer 和长随机标识继续脱敏。
- 日志只保存在本机 Tampermonkey 存储中，不会静默上传。问题反馈入口会先尝试复制日志，再由用户主动粘贴到 GitHub Issue。

### 检查更新

- 手动“检查更新”发现新版本后，直接打开 Release 中固定的 `sanguosha-channel-login.user.js` 资产地址，让 Tampermonkey 接管安装或覆盖安装流程。
- 没有检测到新版本时，只在面板提示“已是最新版本”，不会打开多余页面。
- 自动检查仍为每天最多一次，只在面板标记可用更新，不会自行弹出标签页。
- 固定更新地址保持为 `releases/latest/download/sanguosha-channel-login.user.js`，不随 Release 页面布局变化。

### 界面与稳定性

- 登录、账号、诊断保持三页菜单结构，诊断页签直接显示异常数量，页面不会因功能增加而持续纵向堆叠。
- 折叠标题栏保留渠道名与“展开”按钮，隐藏操作在折叠态收起，减少对游戏画面的遮挡。
- 账号列表、加载状态、资料回填和自动折叠使用幂等更新，避免同一身份事件重复刷新或重复收起。
- 独立登录引擎与主脚本内嵌副本继续由 `npm run sync:engine` 同步，减少双份实现漂移。

## 回归验证

本次发布前已运行完整 Node 回归测试，并额外检查主脚本语法与 Git 空白错误。新增和扩充的测试覆盖：

- `_test_game_identity_probe.js`：主世界探针位置、`scriptContent` / 脚本 `text` 入口、协议回调、身份缓存合并与重复事件抑制。
- `_test_game_identity_apply.js`：游戏内 ID 写入账号记录、状态切换、自动折叠和同一身份去重。
- `_test_account_open_window.js`：`waiting / loading / failed / disconnected` 状态重试直登，以及 `connected` 窗口不重复启动登录。
- `_test_account_direct_recovery.js`、`_test_direct_account_resume.js`：跨游戏路由恢复、一次性交接、会话重建、过期保留与取消原因。
- `_test_official_autocollapse.js`：主登录页不因官服选择器折叠、自动展开设置持久化、点击“进入游戏”折叠、手动展开不屏蔽下一次登录。
- `_test_updates_feedback.js`：版本比较、更新安装页直达、日志脱敏、去重、会话保留、导出摘要和紧凑折叠结构。
- `_test_unload_cleanup.js`：页面卸载时计时器、窗口 presence、监听器和临时授权键均被清理。

## v1.2.0 能力回顾

`1.2.0` 是本版之前的稳定基线，主要引入了以下能力：

- **自动更新**：每天最多检查一次 GitHub Release，并支持在面板或油猴菜单手动检查。
- **本地反馈日志**：记录脚本启动、阶段状态和脚本自身异常；支持复制、导出、清空和 GitHub 问题反馈，不上传账号或会话信息。
- **菜单式面板**：将登录、账号和诊断拆分为三页，诊断页签显示异常数量；折叠态缩至 208px。
- **基础自动收尾**：识别官方登录完成并关闭登录弹窗，在游戏资料可用后折叠面板。
- **兼容性基础**：保留 QQ 浏览器标签交接、`window.name` 丢失恢复、慢网络入场守卫和 WeGame 凭证判断修复。

`1.3.0` 在此基础上修正了游戏内 ID 来源、账号直登稳定性、面板展开/折叠时机、日志容量和更新跳转行为。因此从 `1.2.0` 升级时，建议直接覆盖安装本页安装包，不要保留旧的 `1.2.0` 标签页继续操作。

## 页面优化截图

截图为演示数据，账号 ID、角色名和诊断内容均为虚构。

<table>
  <tr>
    <td colspan="2" align="center"><a href="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-01-panel.jpg"><img src="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-01-panel.jpg" width="760" alt="主登录页默认展开渠道登录面板"></a><br><sub>主登录页默认展开；官服账号选择器不参与插件折叠判断</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-02-auto-expand.png"><img src="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-02-auto-expand.png" width="300" alt="主登录页自动展开设置"></a><br><sub>“主登录页自动展开”可关闭并持久保存</sub></td>
    <td align="center"><a href="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-03-accounts.png"><img src="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-03-accounts.png" width="300" alt="账号管理与游戏内 ID"></a><br><sub>游戏内 ID、跨渠道账号与整行选中</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-04-diagnostics.png"><img src="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-04-diagnostics.png" width="300" alt="可溯源反馈日志"></a><br><sub>可溯源日志：流程、阶段、traceId 与异常数</sub></td>
    <td align="center"><a href="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-05-collapsed.png"><img src="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-05-collapsed.png" width="300" alt="208px 折叠标题栏"></a><br><sub>折叠态仅保留渠道标题与“展开”入口</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><a href="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-06-collapsed-page.jpg"><img src="https://github.com/softbad123/sanguosha-channel-login/releases/download/v1.3.0/ui-06-collapsed-page.jpg" width="760" alt="登录成功后面板自动折叠"></a><br><sub>登录成功或点击“进入游戏”后自动折叠为 208px 标题栏</sub></td>
  </tr>
</table>

## 已知限制

- 游戏内 ID 只有在游戏角色资料实际下发后才能读取。首次进入登录页、角色尚未加载或账号尚未进入大厅时，ID 段会暂时省略，进入游戏后会继续回填。
- 本地恢复依赖渠道官方会话仍然有效。渠道主动失效、过期或风控要求重新验证时，仍需完成一次官方授权。
- 版本号保持为 `1.3.0`，因此早期同版本安装不会被自动更新识别。若面板提示“已是最新版本”但缺少本页描述的修复，请从 Releases 手动覆盖安装。
- 最终能否登录仍由渠道服务器、游卡服务器、账号状态和游戏服务器共同决定；本项目不绕过实名、支付、风控或官方授权。

## 来源与许可

- 第一作者：**@暗鹊**。
- 原始源码：[unified-login.user.js](https://github.com/Clarrycy/jinnangmiaoji/blob/main/jinnangdai/payload/unified-login.user.js)。
- 本项目基于上述源码整理、维护与扩展，并非 @暗鹊 官方发布。
- 修改说明、第三方来源与许可证状态见 [THIRD_PARTY_NOTICES.md](https://github.com/softbad123/sanguosha-channel-login/blob/main/THIRD_PARTY_NOTICES.md)。
