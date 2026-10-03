# Privacy / 隐私说明

## English

Leaf Translate has no developer-operated backend, telemetry, ads or third-party translation provider. After you explicitly start translation, the local component sends the selected readable blocks near the viewport, target language, chosen model and necessary formatting markers to OpenAI’s Responses API. Same-origin continuation stays active until you restore the original, close the tab or cross origins. Pause stops new requests. Readable content can be private; the extension does not classify its sensitivity. Inputs, password fields and editable drafts are skipped. OpenAI’s own service terms and privacy practices apply to content it receives. Requests set `store:false`; this is not a claim of zero provider retention.

Sign-in opens OpenAI’s official authorization page with a random state, nonce, PKCE challenge and stable opaque host ID. A previously connected account may supply its email/login hint and ID-token hint directly to that official endpoint. The local component validates callback state and identity, then stores account email, registration IDs, host ID, access/refresh/ID tokens, scopes and expiry locally. Tokens never enter extension storage or webpage DOM. No existing ChatGPT/Codex credential store is read. The temporary loopback listener closes after completion/cancellation or ten minutes. The component uses only the fixed extension ID through Native Messaging.

Storage locations:

| Item | macOS | Linux |
| --- | --- | --- |
| Local component, extension copy, account records | `~/Library/Application Support/Leaf Translate/` | `~/.config/leaf-translate/` |
| Chrome host registration | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.leaf_translate.host.json` | `~/.config/google-chrome/NativeMessagingHosts/com.leaf_translate.host.json` |
| Dia host registration | `~/Library/Application Support/Dia/User Data/NativeMessagingHosts/com.leaf_translate.host.json` | Not supported |

The shared credential directory uses mode `0700`; `credentials.json` uses `0600`, atomic replacement and a cross-process refresh lock. This is filesystem access protection, **not encryption or OS keychain storage**. Anyone able to read that account’s protected files may access credentials. Chrome and Dia share the same account records. Browser storage holds translation settings and a first-use notice flag; session storage holds active tab/run information, URL/origin, document ID and pause state for continuation. Page translations are cached only in memory and cleared on restore, refresh or navigation.

Sign out attempts to revoke the remote refresh session, then clears local tokens while retaining registration mappings and host ID for future sign-in. If revocation cannot be confirmed, disconnect Leaf Translate in [ChatGPT usage settings](https://chatgpt.com/settings/usage). Uninstall scripts remove selected Native Messaging registrations only; shared files remain until you remove the data directory after all browsers stop using it. Deleting local data alone does not guarantee remote revocation.

Permissions: `activeTab` (temporary access after a user action), `scripting` (insert the translator), `storage` (preferences/session), `nativeMessaging` (local sign-in and inference), `contextMenus` (page action). No persistent all-sites or cookie permission is requested. Do not post credentials, private page content or unredacted diagnostic screenshots in GitHub issues. MIT licensing covers the code, not the OpenAI service or its usage allowance.

## 简体中文

叶译没有开发者运营的后端、遥测、广告或第三方翻译服务。用户主动启用翻译后，本地组件将所选范围内、视口附近的可读段落、目标语言、模型及必要格式标记发送至 OpenAI Responses API。同源导航会自动续译，直到恢复原文、关闭标签或跨源；暂停时不发起新的翻译请求。可读正文可能包含私人信息，插件不会判断其敏感程度。输入框、密码框及可编辑草稿会跳过。OpenAI 收到的数据适用其服务条款与隐私规则；请求使用 `store:false`，但这不代表服务提供方零留存。

登录只打开官方 OpenAI 授权页，携带随机 state、nonce、PKCE 挑战和稳定匿名主机 ID。再次连接已有账号时，邮箱及 ID token 可作为登录提示直接发送至该官方端点。组件验证回调和身份后，将邮箱、注册 ID、主机 ID、访问/刷新/身份令牌、授权范围及有效期保存到上述本地目录。令牌不进入扩展存储或网页 DOM，不读取既有 ChatGPT/Codex 凭据。临时回调监听在成功、取消或十分钟后关闭。Native Messaging 只允许固定扩展 ID。

账号目录权限为 `0700`，`credentials.json` 为 `0600`，采用原子替换及跨进程刷新锁；这是文件权限保护，**不是加密或系统钥匙串存储**。有权读取该用户受保护文件的人仍可能取得凭据。Chrome 与 Dia 共用账号记录。浏览器本地存储包含翻译偏好与首次提示标记；会话存储包含续译所需的标签任务、URL/来源、文档 ID 及暂停状态。译文缓存只在页面内存，恢复原文、刷新或导航后清空。

退出会尝试撤销远端刷新会话，再清除本地令牌；保留注册映射和主机 ID 供下次登录。如果撤销未确认，请在 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 断开叶译。卸载脚本仅移除所选浏览器的连接注册；所有浏览器不再使用后，可手动删除共享数据目录。仅删除本地文件不能保证远端授权已撤销。

权限只有 `activeTab`、`scripting`、`storage`、`nativeMessaging` 和 `contextMenus`，分别用于用户主动操作后的临时网页访问、插入翻译脚本、偏好/会话存储、本地连接及右键菜单。没有常驻全站或 Cookie 权限。不要在 GitHub issue 中提交凭据、私人正文或未脱敏诊断截图。MIT 许可只覆盖代码，不覆盖 OpenAI 服务或额度。
