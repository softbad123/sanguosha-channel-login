# v1.4.1 · 固定面板、紧凑功能键与居中扫码弹窗

> 本版集中优化面板前端：三页功能共用固定 `360 × 500px` 外框，压缩非必要说明，移除账号与日志区的折叠箭头，并在屏幕中央显示扫码二维码。账号增多或日志增长时，只在各自区域内滚动，不再撑大或截断面板。

## 面板预览

<table>
  <tr>
    <td align="center"><a href="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/login.png"><img src="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/login.png" width="320" alt="固定尺寸登录页"></a><br><sub>登录页：固定 360 × 500px</sub></td>
    <td align="center"><a href="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/login-cancel.png"><img src="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/login-cancel.png" width="320" alt="登录进行中与取消当前登录"></a><br><sub>登录进行中：“取消当前登录”完整可见</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/accounts.png"><img src="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/accounts.png" width="320" alt="账号管理页"></a><br><sub>账号页：列表内部滚动，无折叠箭头</sub></td>
    <td align="center"><a href="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/diagnostics.png"><img src="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/diagnostics.png" width="320" alt="诊断与运行记录页"></a><br><sub>诊断页：单行工具条与内部滚动日志</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/qr.png"><img src="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/qr.png" width="320" alt="屏幕中央二维码弹窗"></a><br><sub>扫码：屏幕中央 240px 弹窗</sub></td>
    <td align="center"><a href="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/about.png"><img src="https://raw.githubusercontent.com/softbad123/sanguosha-channel-login/main/docs/screenshots/v1.4.1/about.png" width="320" alt="关于弹窗"></a><br><sub>安全、作者、源码与协作信息收进“关于”</sub></td>
  </tr>
</table>

> 截图中的账号名称、游戏内 ID、区服和运行记录均为虚构演示数据。

## 安装或升级

- 下载 [`sanguosha-channel-login.user.js`](https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js)，在 Tampermonkey 中导入或覆盖安装。
- 建议使用 Tampermonkey `5.5.1` 或更新版本。安装后刷新三国杀登录页，页脚应显示 `v1.4.1 · 9 个渠道`。
- 不要同时启用旧的统一登录器、其他渠道登录器，或任何会向同一页面注入登录面板的脚本。
- 源码、使用说明和问题排查见 [`main` 分支 README](https://github.com/softbad123/sanguosha-channel-login#readme)。

## 本版更新

### 固定面板与紧凑布局

- 登录、账号、诊断三页统一使用固定 `360 × 500px` 外框；窗口较矮时自动收缩，避免越出视口。
- 标题、状态卡、页签和页脚常驻；只有当前页内容区域滚动，切换页签不再改变窗口尺寸。
- 登录按钮压缩为 `36px` 高，保存登录信息开关压缩为 `36px` 高，并固定为“取消当前登录”预留 `34px`。
- 删除“授权后卡在 404／空白页？”提示及手动回填入口，避免登录页被额外说明挤压。
- 账号管理改为始终展开的普通区块，移除右侧折叠箭头；工具栏改为三列，账号列表自适应剩余高度。
- 诊断页移除运行记录折叠箭头，工具条改为单行四列；日志区占满剩余高度并在内部滚动。
- 安全说明、第一作者与源码来源从诊断页移入页脚“关于”弹窗。

### 居中扫码弹窗

- 二维码不再嵌入面板，改为在屏幕中央显示 `240px` 的官方二维码弹窗。
- 点击右上角关闭、点击遮罩或按 `Esc` 都会取消本次扫码流程，不会把取消后的二维码残留在面板中。
- 面板恢复为单列紧凑布局，扫码状态、提示和操作按钮不会因二维码高度而溢出。

### 署名关联

- 原始作者“暗鹊”的署名统一关联到其 GitHub 账号：[@Clarrycy（暗鹊）](https://github.com/Clarrycy)。
- 脚本元数据、关于弹窗、README、历史发布说明和第三方来源声明已同步这一关联关系。

## 验证

- `npm test`：34 项回归测试全部通过。
- 正式版、本地测试版与独立引擎均通过 `node --check`。
- 在 `1280 × 800` 标准窗口和 `1280 × 480` 矮窗口中通过 Chrome DevTools Protocol 布局测试。
- 三个页签的面板尺寸和位置保持一致；账号与日志增长时仅内部列表滚动；页脚不截断；运行时异常数为 0。
- 二维码弹窗水平与垂直居中，图像为正方形，关闭后登录流程正确取消。

## 贡献与协作

- 第一作者：[@Clarrycy（暗鹊）](https://github.com/Clarrycy)，原始《统一登录器》源码作者；本项目并非其官方发布。
- 维护者：[@softbad123](https://github.com/softbad123)。
- 本项目在设计、实现、测试与文档整理过程中由 `deepseek-v4.1-flash` 模型协作完成；模型参与不构成 DeepSeek 官方发布或背书。
- 完整贡献者与协作说明见 [CONTRIBUTORS.md](https://github.com/softbad123/sanguosha-channel-login/blob/main/CONTRIBUTORS.md)；GitHub 自动统计页见 [Contributors](https://github.com/softbad123/sanguosha-channel-login/graphs/contributors)。
- 修改说明、第三方来源与许可证状态见 [THIRD_PARTY_NOTICES.md](https://github.com/softbad123/sanguosha-channel-login/blob/main/THIRD_PARTY_NOTICES.md)。

## 已知限制

- 面板布局优化不改变官方授权与会话策略；本机保存的登录状态失效时，仍需重新完成对应渠道的官方授权。
- 最终能否登录仍由渠道服务器、游卡服务器、账号状态和游戏服务器共同决定。
- 本项目不绕过实名、支付、风控或官方授权。
