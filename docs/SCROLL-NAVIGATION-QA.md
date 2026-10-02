# 滚动、动态内容与导航修复记录

日期：2026-10-02。基线提交：`2dafeb5`。本报告记录修复分支的隔离验证；没有替换正式安装。

## 根因与改动

1. `collectBlocks` 默认选取首个可见 `article`。X 的公开个人页实际是一个 `main` 下含多个 `article`，导致其他帖子根本没有进入队列。现在优先稳定的 `main`，无 main 时仅在顶层可见 article 唯一时选它，否则扫描 body。
2. 每次 DOM mutation 都重新计时 450ms，页面持续变化时扫描可无限延后。现在一次合并窗口内只安排一个扫描，保留 characterData、childList 和相关属性监听。已有 Text 节点第二、第三、第四次变化也持续重译。
3. 原记录只比较序列化文字及末尾节点，未监听 href，也未核对链接/行内代码元信息。现在比较完整节点序列和源文字/标签信息，并在异步写回时验证记录身份、代次、节点连接及源内容。复用节点不再沿用过期的链接和译文。
4. 原实现未在移除记录时释放 IntersectionObserver 的目标。现在按元素协调观察集合，删除虚拟列表项时释放引用，同一元素多个文字段落仍共享观察。
5. 后台在任意 URL 变化或 loading 时直接 stop；内容脚本在 SPA URL 变化时也 stop。现在保存标签页内的同源续译意图，取消旧请求，在新文档完成或同文档路由变化后注入/启动；暂停状态跨导航保留。用导航尝试身份拒绝过时的注入结果，继续校验 documentId/runId。

## 自动验证

- `npm test`：45/45，通过。[完整测试日志](qa/scroll-navigation/test-results.txt)。
- `npm run build`：通过，[构建日志](qa/scroll-navigation/build-results.txt)。
- 对 `src`、`scripts`、`tests` 下全部 JS/MJS 执行 `node --check`：通过。
- `git diff --check`：通过。
- 项目是 JavaScript，未配置 TypeScript/独立 typecheck；没有把语法检查称作类型检查。
- 首轮新增回归在未修复代码上出现 5 个失败，涵盖首篇文章范围、持续更新以及复用链接。修复后全部通过；随后加入导航回归。

覆盖：新增同级帖子、持续 class 更新期间扫描、同一 Text 节点连续替换、多轮虚拟列表移除/追加、视口外延后与进入视口、请求中替换源内容、复用 href、同元素多文字段落、暂停后追加/继续、停止并重新开启、迟到结果抑制；后台同文档 push/replace/back/forward 对应 URL 事件、新文档完成、暂停保持、停止/跨源撤销、异步注入被停止或后续导航取代、旧文档请求拒绝。DOM 与 Chrome API 采用测试替身；导航事件测试不等同于真实 Chrome 扩展端到端测试。

## 真实浏览器端到端验证

用户明确批准后，在这台 Mac 的全新临时 Chrome for Testing 145 配置（`/tmp/leaf-translate-scroll-test/profile`）加载生产 `dist/extension`。没有使用用户已有 Chrome/Dia 资料，也没有改 manifest。独立 Native Messaging 测试主机只在本机为原文加上 `【固定译文测试】` 标识，无认证、凭据读取或网络调用。用原生扩展快捷键取得真实 activeTab 授权。

### 真实 x.com 连续滚动

访问 `https://x.com/OpenAI`：DOM 为 1 个 main、5 个 article。连续五次滚动，每次 850px，实际扩展状态如下：

| 位置 scrollY | 已译/总段落 | 五条帖子的译文节点数 |
| --- | --- | --- |
| 0 | 19/29 | 4, 2, 0, 0, 0 |
| 850 | 23/29 | 4, 3, 3, 0, 0 |
| 1700 | 26/29 | 4, 3, 3, 3, 0 |
| 2550 | 29/29 | 4, 3, 3, 3, 3 |
| 3192（底部） | 29/29 | 4, 3, 3, 3, 3 |

后面的帖子随滚动进入队列并插入固定译文，未再次点击扩展。证据：[逐步状态记录](qa/scroll-navigation/results.json)，[初始截图](qa/scroll-navigation/x-translated-start.png)、[滚动至底部截图](qa/scroll-navigation/x-translated-scrolled.png)。

同标签页直接导航到公开帖子 `https://x.com/OpenAI/status/2104986129686741046` 后自动出现 13/24 段固定译文；返回个人页自动出现 18/28 段固定译文。证据：[导航及后退状态](qa/scroll-navigation/results.json)、[帖子新文档截图](qa/scroll-navigation/x-navigation-translated.png)。这是实际同源新文档/后退流程，无第二次启用操作。访客页内点击日期链接没有发生导航，未把那次点击当作通过。

**X 访客页只提供 5 条帖子，底部显示 “See OpenAI’s full profile / Continue to X”。因此已证明可访问的后续帖子继续触发翻译、同源新文档自动续译；尚不能声称登录后无限流新批帖子或 X 的虚拟列表全部通过。** 该剩余测试需要用户亲自在隔离环境登录 X。没有发帖、点赞、关注或修改 X 账户设置。

### 本地动态信息流与导航

以 `tests/fixtures/feed.html`、`feed-next.html` 在 `127.0.0.1:8765` 测试真实扩展、后台和 Native Messaging。页面每 40ms 产生 DOM 更新，并在滚动到底时追加帖子。

- 信息流从 12 帖继续追加至 20、24、29 帖，新增且接近视口的段落持续出现译文。
- 同一个 Text 节点连续变为版本 1、版本 2，两次译文均更新。
- 暂停后追加/滚动：29 帖中保持 22 段译文；继续后变为 27 段，剩余离屏段落按视口策略延后。
- pushState、replaceState、后退、前进：均自动恢复为 4/4 段。
- 普通新文档：自动 1/1 段；暂停后再跳转：0/1 段且按钮为「继续」；继续后恢复 1/1。
- 恢复原文后再跳转：8 帖、0 译文；再次通过原生快捷键启用：5/8 段。
- 从 `127.0.0.1` 跳到 `localhost`（不同 origin）：0 个扩展 DOM 节点，没有越过 activeTab 边界自动启动。

完整可复查结果：[浏览器回归状态](qa/scroll-navigation/results.json)；执行脚本：[Playwright CLI 回归脚本](qa/scroll-navigation/local-feed-check.js)；截图：[新文档自动翻译](qa/scroll-navigation/feed-navigation-success.png)。重新启用和跨源边界记录于同一结果文件的 `reenable`、`crossOrigin` 字段。

首版浏览器测试脚本曾等待无限流继续追加后仍在视口外的“最后一帖”，因视口延后策略超时；校正为等待本次实际追加、已滚入视口的目标后通过，没有为迎合测试改动产品调度。X 自身控制台存在第三方登录/网络警告，本地样例只有 favicon 404；没有把这些归为扩展失败。

这些回包都是明确标注的固定测试文本，**不是实际中文翻译质量或真实 OpenAI 服务验证**；真实模型/额度尚未测试。此前未加载扩展的只读截图仅保留在本地，不作为翻译成功证据。

## 权限和范围

Manifest 权限未改变：`activeTab`、`scripting`、`storage`、`nativeMessaging`、`contextMenus`。不新增 host_permissions。Chrome 的 [activeTab 文档](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)明确同源导航保留临时访问、跨源导航撤销。

恢复原文/停止、关闭标签页、跨源导航会清除续译意图；不同协议、子域名或端口均属跨源。暂停及额度错误暂停会保留，暂停期间不发新翻译请求。现有 DOM 排除规则保留；原产品没有站点排除名单，本次没有新增。仍有原先 3,000 段落扫描上限以及 iframe、页面 Shadow DOM 等限制；未宣称解决所有站点布局或大规模无限增长页面。

## 参考

仅借鉴公开设计，未复制第三方实现代码：

- [TWP pageTranslator.js](https://github.com/FilipePS/Traduzir-paginas-web/blob/master/src/contentScript/pageTranslator.js)：MPL-2.0，积累新增/移除节点后定期处理，避免持续变化饿死调度；其此处监听未包含 characterData，不能照搬解决原节点文字更新。
- [Firefox translations-document.sys.mjs](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/translations/content/translations-document.sys.mjs)：MPL-2.0，监听文字变更、合并处理、使旧工作失效及写回前检查连接/任务身份。
- [沉浸式翻译高级配置](https://immersivetranslate.com/en/docs/advanced/)：公开的站点选择器与流式变化行为说明，仅作为行为参考。
