# 叶译 · Leaf Translate

[English](README.md) · 简体中文

Chrome Manifest V3 双语网页翻译插件。使用 **OpenAI 官方 Sign in with ChatGPT** 授权，在账号允许的范围内使用 ChatGPT 套餐或额度，不需要填写 API Key。

这是可加载的开发者版，包含完整源码、已构建插件和本地连接组件；未发布 Chrome Web Store。MIT 许可。需要 Node.js 22+、Chrome 120+；macOS 也支持 Dia。

**下载安装包：[v0.2.0 开发者预览版](https://github.com/ydotdog/leaf-translate/releases/tag/v0.2.0)**。请选择 Release 附件中的 `leaf-translate-0.2.0.zip`；GitHub 自动生成的 Source code 压缩包不包含 `dist`，需要先按下方开发说明构建。

![双语网页排版示例，使用固定测试译文](docs/screenshots/bilingual-desktop.png)

## 安装（Mac）

1. 解压完整的 `leaf-translate` 文件夹。
2. Chrome 双击 `install-macos.command`；Dia 双击 `install-dia-macos.command`。若同时使用两个浏览器，两个安装器各运行一次。若提示没有 Node.js，先从 [Node.js 官网](https://nodejs.org/) 安装 22 或更新版本。
3. 在对应浏览器打开 `chrome://extensions`（Dia 会显示为 `dia://extensions`），开启「开发者模式」，点击「加载已解压的扩展程序」。按 `⌘⇧G` 输入 **`~/Library/Application Support/Leaf Translate/extension`** 并选择此目录。安装器已将插件复制到这个固定位置。
4. 点击叶译的设置按钮，选择 **Continue with ChatGPT**，在官方页面完成登录并授权使用 ChatGPT 额度。
5. 选择账号返回的可用模型。打开普通网页，点击「翻译当前网页」。

快捷键：`Alt + Shift + T` 切换双语 / 原文。也可以右键网页选择叶译。Chrome 工具栏的拼图菜单中可固定叶译。

两个浏览器共用本机 ChatGPT 登录记录；翻译偏好分别保存在各自浏览器中。一处退出会断开共享账号。如果目录选择按钮一直灰色，先取消并重新输入完整目录路径。更新时下载新发行包并运行所用浏览器的安装器，更新扩展与本地组件；再在各浏览器扩展页点击叶译的「重新加载」。已打开的网页刷新后再启用翻译即可，无需重启整个浏览器。仅覆盖扩展文件不会更新本地登录回调页。

固定扩展 ID：`hkpccpakokoliiahjeifekgadoffdpac`。请保留 `extension-key.json` 和构建后的 manifest key，否则本地组件的允许列表需要同步更新。

`extension-key.json` 只有公开的扩展公钥，不是登录凭据。旧 v0.1.0 发行包不包含滚动/导航修复及三语界面。运行安装器前请先审阅脚本，遵循 macOS 的安全提示，不需要关闭系统安全保护。

## 界面语言

扩展名称、popup、设置页、首次用量提示、连接状态、错误、右键菜单、快捷键说明、网页浮动工具栏及本地登录回调页跟随 `chrome.i18n.getUILanguage()`。完整提供英文、简体中文和繁体中文：`zh-Hans` / 中国大陆 / 新加坡使用简体，`zh-Hant` / 台湾 / 香港 / 澳门使用繁体，显式书写系统优先于地区；其他语言回退英文，单独 `zh` 使用简体。浏览器语言变化后重新打开扩展页面；按 Chrome 要求重启浏览器后，右键菜单也会刷新。网页语言及 Accept-Language 不参与界面选择。

不会自动改变目标翻译语言：初始目标仍为简体中文，已保存的选择原样保留。目标语言列表使用各语言的自称，模型名称由 OpenAI 返回。官方 OpenAI 登录页由 OpenAI 控制；本地成功/失败回调页使用发起登录的浏览器 UI 语言。命令行安装器使用英文提示，因为它没有 Chrome UI 语言上下文。

## 为什么有本地组件

当前官方开源应用登录流程要求 `http://127.0.0.1:<随机端口>/auth/callback`，并要求令牌保留在受保护的本地存储，不放入浏览器存储。纯 Chrome 扩展不能监听这个回调，所以叶译通过 Chrome Native Messaging 使用一个本地 Node 组件。

- Chrome 按需启动组件，无需一直开着终端，无需 Codex CLI。
- 回调只在登录期间监听本机地址，完成、取消或十分钟超时后关闭。
- 扩展和组件通过标准输入/输出通信；没有长期运行的 HTTP 翻译代理。
- OpenAI 令牌不会返回扩展或网页，页面内容由本地组件直接发送至 `api.openai.com/v1/responses`。
- 不读取 ChatGPT/Codex 的既有凭据，不使用 ChatGPT 网页的内部 `backend-api`。

官方接入说明：[开源应用与 ChatGPT 额度](https://developers.openai.com/siwc/token-sharing-open-source)、[登录与回调](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)。是否可授权、模型可用性和限额，以当前账号与 OpenAI 返回结果为准。

每位使用者在自己的电脑上登录，生成绑定其账号/工作区的注册信息；本项目不会分发维护者的令牌或共用账号。开源不等于无限免费额度，也不保证所有账号均符合资格。商业或远程托管应用需按 [OpenAI 的商业接入条件](https://developers.openai.com/siwc/request-client-id) 另行申请；MIT 许可不替代 OpenAI 服务条款，也不代表官方背书。

## 阅读与排版

- 段落级双语对照，原节点不替换；恢复原文只移除插件添加的内容。
- 保留链接、强调、上下标、嵌套列表、表格单元格和段落顺序。
- 译文采用 Shadow DOM 隔离样式，继承字号和文字颜色；适配窄屏、深色页面及阿拉伯语阅读方向。
- 长页面按视口附近范围翻译，支持批量请求、内存缓存、动态追加和原文变更。
- 长段落分块，分块时保持行内格式标记配对；仅在完整响应校验通过后显示译文。
- 暂停、继续、一键恢复；同一标签页同源导航会取消旧任务并自动翻译新页面，暂停状态会保留。额度错误会暂停，保留原文，不切换计费方式。
- 跳过输入框、可编辑内容、隐藏区域、代码块、数学公式、导航及显式不翻译区域；行内代码在译文中原样保留。

「优先正文」选择可见 main（含 role="main"），没有 main 时选择唯一可见的顶层 article，否则使用页面正文。信息流中的多篇帖子和后续加载内容会持续扫描；已有节点的文字、链接及行内格式变化也会重新核对译文。持续页面更新不会无限推迟扫描。可切换「整个页面」以包含正文以外的内容。插件是通用启发式实现，未宣称兼容所有站点。部分固定高度、裁剪或高度定制的页面仍可能需要网站专用规则。

当前不支持 PDF、图片 OCR、iframe、Shadow DOM 内部、字幕与 Chrome 内部页面。最多扫描约 3,000 个段落；flex/grid 中没有独立元素容器的裸文本会保守跳过。当前提供双语与恢复原文两种视图，没有“仅译文”模式。

开启后，同源 SPA 路由切换、前进/后退、刷新和普通页面跳转无需再次点击翻译。点击「恢复原文」、关闭标签页或跨源导航会结束该标签页的自动续译；再次启用需主动点击扩展。跨来源（包括协议、子域名或端口变化）受 `activeTab` 授权边界限制，不申请常驻网站权限。暂停期间新页面会保持暂停，点击「继续」后才发送文本。没有新增站点排除名单，原有 `translate="no"` 等内容排除仍有效。

## 数据与权限

另见双语 [隐私说明](docs/PRIVACY.md)。请求使用 `store:false`，但这不代表服务提供方零留存。

用户点击翻译后，所选范围内、阅读位置附近的文本段落会发送给 OpenAI。网页中的私人文章、邮件等可读正文同样可能包含私人信息；插件不会判断正文是否敏感。输入框、密码框和草稿编辑区不读取。

Chrome 权限只有 `activeTab`、`scripting`、`storage`、`nativeMessaging`、`contextMenus`。没有所有网站的常驻访问权限、Cookie 权限、遥测或第三方翻译服务。浏览器仅保存偏好、首次提示状态和短期任务授权。翻译缓存只在当前页面内存中，恢复原文、刷新或导航后清空。

Mac 本地组件、固定插件副本与账号记录位于 `~/Library/Application Support/Leaf Translate/`。Chrome 主机注册位于 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.leaf_translate.host.json`，Dia 注册位于 `~/Library/Application Support/Dia/User Data/NativeMessagingHosts/com.leaf_translate.host.json`。Linux 对应 `~/.config/leaf-translate/` 和 `~/.config/google-chrome/NativeMessagingHosts/`。凭据目录权限 0700，凭据文件 0600，使用原子替换和跨进程刷新锁；没有声称使用系统钥匙串加密。

退出时尝试撤销远端刷新会话，然后清除本地令牌，保留注册映射和主机 ID 便于再次登录。若远端撤销未确认，界面会提示到 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 断开授权。

## 开发、Linux 与卸载

```sh
npm ci
npm test
# npm test 会先构建，然后执行回归测试
npm run build
npm run install:host
```

Linux 运行 `npm run install:host` 后，在 Chrome 加载安装器输出的固定目录 `~/.config/leaf-translate/extension`。Linux 安装尚未实机验证。Chromium/Edge 和 Windows 尚未提供正式安装流程。

Mac 命令行可用 `npm run install:host -- --browser dia` 单独注册 Dia，或用 `--browser all` 同时注册 Chrome 与 Dia。默认仅注册 Chrome。

卸载：先在叶译退出，并按需在 ChatGPT 设置断开授权；在浏览器移除扩展，然后运行 `npm run uninstall:host`（Chrome）、`npm run uninstall:host -- --browser dia` 或 `npm run uninstall:host -- --browser all`。卸载命令只移除所选浏览器的连接注册，保留其他浏览器可能仍在使用的共享组件、插件副本与账号记录。两个浏览器都卸载后，如需彻底清理，再手动删除上面的 Leaf Translate 应用数据目录。

## 验证状态

见 [三语与公开审计报告](docs/PUBLICATION-QA.md)、[滚动与导航回归](docs/SCROLL-NAVIGATION-QA.md)、[初版测试报告](docs/QA.md) 和 [设计与开源参考](docs/REFERENCES.md)。自动测试、真实 Chrome 与 Dia 的安装和本地连接、独立 Chrome 的固定译文排版流程已经验证。项目为 JavaScript，没有独立 TypeScript 类型检查；构建检查语法及打包。

真实 x.com 已在独立浏览器的未登录公开页面验证连续滚动与同源跳转，译文使用本地固定响应；访客登录墙限制了继续加载，不能等同于已登录无限信息流或真实模型质量验证。本次三语实际 UI 检查使用独立 Chrome for Testing 和模拟账号状态，不修改个人浏览器语言，也不使用真实额度。**尚未完成真实 OAuth 授权、真实模型翻译与 ChatGPT 用量核对**，因此当前交付不能作为账号服务端开通或真实翻译质量的证明。
