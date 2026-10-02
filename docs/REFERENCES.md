# 实现依据与开源参考

核对日期：2026-10-02。此项目为独立实现，没有复制以下 GPL 项目的源代码；这些项目不是打包依赖。

## 网页翻译工具

- [KISS Translator](https://github.com/fishjar/kiss-translator)：参考段落级双语、富文本保留、按块扫描、排除区域、批量翻译和恢复原文的产品行为。阅读了提交 `7de86b4efcadf4245bbab0d9bcfb0c594b5ab2cd` 的 [`src/libs/translationTargets.js`](https://github.com/fishjar/kiss-translator/blob/7de86b4efcadf4245bbab0d9bcfb0c594b5ab2cd/src/libs/translationTargets.js)，借鉴“遍历/选择目标与插入译文分离”的思路。原项目 GPL-3.0。
- [TWP / Translate Web Pages](https://github.com/FilipePS/Traduzir-paginas-web)：参考实时网页翻译及原文恢复这一使用方式。仓库主页已核对，源码文件获取未成功，因此没有声称审阅其分段算法。
- [Immersive Translate 仓库声明](https://github.com/immersive-translate/immersive-translate/blob/main/README_english.md)：当前产品并非开源，仓库不包含当前源码；未将它列作开源代码依赖。

## OpenAI 官方协议

- [开源应用使用 ChatGPT 额度](https://developers.openai.com/siwc/token-sharing-open-source)：动态注册、主机身份与授权范围。
- [注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)：初次使用 `dynamic_agent_client`，保存返回的 issued client ID；loopback 回调、PKCE、state、nonce、ID token 校验。
- [账号与会话](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)：每个注册独立存储、序列化刷新、撤销、保护凭据、不存入浏览器。
- [模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)：使用账号的 models 列表；公共 Responses endpoint；仅 `response.completed` 表示完整成功。
- [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)：`store:false`、`stream:true`、数组 input、不使用不受支持的温度或 token 上限参数。
- [错误恢复](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)：额度、身份、地区/策略和服务暂不可用的处理；没有隐式 API 计费回退。
- [UI 指南](https://developers.openai.com/siwc/ui-ux-guidelines)：明确 ChatGPT 额度、首次提示与管理用量链接。登录按钮使用准确文字；品牌图形尚未引入，商店发布前应再核对官方按钮资产要求。

## Chrome

- [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)：限定 extension origin、主机注册位置、UTF-8 JSON 帧、原生字节序长度前缀。

## 打包依赖

本地组件打包 `jose`（MIT）用于 JWT 验证；许可证随包位于 `dist/native/jose-LICENSE.md`。esbuild 与 jsdom 仅用于开发构建和测试，不是浏览器运行时依赖。版本由 `package-lock.json` 固定。
