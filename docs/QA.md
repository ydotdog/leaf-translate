# 验证记录

日期：2026-10-02（America/New_York）。构建：0.1.0。

## 自动测试

`npm test`：26 项全部通过。执行前自动重新构建。

- 分段：正文优先、整页范围、嵌套列表、表格单元格、隐藏与不可翻译区、输入和编辑区排除。
- 排版：链接与强调标记、行内代码原样保留、flex/grid 项目内插入、长段落和大量短标记分块。
- 恢复：源节点及事件监听不被替换；动态原文更新替换旧译文；SPA 路由变化停止；请求未完成时恢复不会重新插入迟到译文。
- 请求：批量上限、ID 对应、格式标记完整性、恶意 HTML 作为文字显示、危险克隆链接不保留。
- OAuth：PKCE、host ID、返回 client ID、state、拒绝授权、ID token 的签名、issuer、audience、expiry、nonce 与返回账号身份校验。
- 本地会话：0600/0700 权限、原子替换、多个存储实例并发写、刷新串行化与轮换、终止型刷新错误清理令牌但保留注册。
- 推理：公开 Responses 路由、所需参数、碎片化 UTF-8 SSE、完整结束事件、截断、incomplete、开始流式传输后返回的额度错误。
- 调度：批量段落、动态内容去重、额度错误暂停、不自动重试、恢复/导航取消。

测试使用受控 fixture 和模拟网络响应，不是 OpenAI 真实授权或真实翻译质量测试。

## 真实 Chrome 检查

使用独立 Google Chrome for Testing 145.0.7632.6 配置，加载生产 `dist/extension`，没有给生产 manifest 增加所有网站权限。

- 实际 Native Messaging 主机成功返回未登录状态；没有读取用户既有 ChatGPT/Codex 凭据。
- 随后仅在测试配置中切换到固定译文主机，模拟账号和模型明确标注为排版测试。
- 通过系统级 `Alt + Shift + T` 启动翻译，验证真实 `activeTab` 授权、后台服务、内容脚本和原生消息往返。
- 初次翻译 12 个可见附近段落，实际聚合为 2 次请求，每次 6 段；远端段落当时没有发出请求。
- 向下滚动后远端段落才翻译；动态加载的新段落正常接续。
- 测试输入框内容未出现在翻译请求中，值保持原样。
- 1200px 页面和 390px 窄屏检查无横向溢出；窄屏表格宽 350px，位于 390px 视口内。
- 深色模式、表格、嵌套列表、行内代码与卡片排版人工检查。
- 恢复后 `body.innerHTML` 与去除插件元素后的原始快照完全相等，原有链接保持同一 DOM 节点，插件元素数为零。
- 弹窗压缩到 583px 内容高度，主操作按钮底部 484px，符合 Chrome 600px 弹窗高度限制。
- 测试页面控制台：0 errors、0 warnings。
- 最终构建重新启动并开启开发者模式后，再次验证了系统快捷键、暂停和继续。
- 运行时依赖审计：`npm audit --omit=dev --audit-level=high`，0 vulnerabilities。

截图：[宽屏双语](screenshots/bilingual-desktop.png)、[窄屏深色表格](screenshots/narrow-dark.png)、[弹窗](screenshots/popup.png)。截图展示固定译文，不是实时 ChatGPT 输出。

测试时 macOS 拒绝 Chrome 执行位于 Documents 内的连接脚本；将隔离测试组件移至临时目录后成功。正式安装器始终把组件复制到用户的 Application Support 目录，并不从下载/文稿目录运行主机。

## 尚未验证

- 用户真实 OAuth 登录、同意授权、账号资格、模型列表和真实 Responses 请求。
- 在 ChatGPT 用量页核对实际额度消耗、账号专属限制与撤销效果。
- 真实模型的翻译质量和大规模网页适配。
- Linux 安装、Windows、Edge、Chromium 和 Chrome Web Store 发布流程。

上述未验证项需要相应真实账号/设备。没有把模拟成功等同于服务端开通。
