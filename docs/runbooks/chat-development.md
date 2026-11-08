# 聊天开发与验收

## 当前实现

Expo / NestJS / Supabase SDK，后台真实匿名身份，不增加登录 UI。Discover Heart 先展示 Match，CHAT NOW 创建/取得真实会话后打开聊天，Chats 显示服务端角色资料与最后一条消息；列表目前最多 50 个会话，内部按最后活动排序。后台批量关联角色与最新消息，避免客户端逐项请求；所有查询以已验证用户限制归属，公共资料不包含 system_prompt。

聊天页按用户参考图完成背景、头像、类型、深色描边消息和底部胶囊输入框。真实角色没有正式图片配置时使用中性占位，不把开发头像套给真实角色。支持历史分页、发送状态、失败后重新编辑、同内容同键重试及历史恢复。参考 [视觉基准](../product/chat-visual-spec.md)、[ADR 0009](../decisions/0009-chat-experience.md)。

## 运行与配置

```bash
pnpm install --frozen-lockfile
pnpm dev:api
pnpm dev:mobile
```

服务端使用 SUPABASE_URL / SUPABASE_SECRET_KEY、AI_PROVIDER / AI_MODEL / DEEPSEEK_API_KEY 及独立审核配置。默认 DeepSeek Chat Completions，保留独立 OpenAI Responses 和可配置 HTTPS 兼容适配器。模型无自动付费重试、无跨供应商自动回退，密钥不进入移动端。

移动端需 EXPO_PUBLIC_SUPABASE_URL、EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY、可达的 EXPO_PUBLIC_API_URL。浏览器 origin 要加入服务端 CORS_ALLOWED_ORIGINS；原生 App 不依赖浏览器 CORS。真机要用可达的局域网或 HTTPS API 地址。本云环境不提供对用户可用的预览链接，设计审阅使用独立 ZIP 体验包。

2026-11-08 公开 URL / publishable key 和匿名开关已生效；真实匿名、DeepSeek 和浏览器闭环通过，详见 guest-acceptance.md。六个开发角色已发布，临时测试身份和聊天会清理。角色正式封面、原生设备、等级/支付仍待交付。

## API

均需 Supabase 用户 bearer access token，服务端 Secret key 不能代替用户身份。

- POST /v1/conversations：body {characterId}，同用户同角色幂等打开。
- GET /v1/conversations：本人的会话、公开角色、lastMessage；不返回提示词和管理字段。
- GET /v1/conversations/:id：受归属保护的角色资料与会话。
- GET /v1/conversations/:id/messages?limit=50&before=SEQUENCE：按序历史与 nextBefore。
- POST /v1/conversations/:id/messages：JSON 返回完整持久化结果，保留兼容。
- POST /v1/conversations/:id/messages/stream：同样的 {requestKey,text}，返回 SSE status / completed / error 事件。非法参数和他人会话在打开流之前拒绝。

消息包含轮次状态、请求编号及当前 leaseExpiresAt。重试保留原消息创建时间，但读取新的生成租约；不能以消息年龄判断新尝试已经过期。

## 流式、审核与断线

服务端读取供应商真实流，DeepSeek / 兼容协议使用 stream=true、include_usage；OpenAI 使用 Responses stream。文本上限和单次 30 秒截止时间限制服务端缓冲，不转发 reasoning_content、工具负载或原始错误。

当前策略先检查用户输入，再生成完整回复、记录用量、检查输出并事务保存。客户端在过程中实时收到 checking / generating / saving 状态；审核并保存后才收到 completed 内容。因此这是供应商流与 SSE 交付，当前不逐字提前显示，也不加打字动画冒充实时生成。分段审核和摘要仍属后续开发。

每轮 requestKey 是 UUID。原生待发送内容存于分块 SecureStore，浏览器放在 sessionStorage，均按游客/会话隔离；重复点击有锁，重试无自动新键。刷新后读取原请求，已完成则从历史恢复并清除待发送记录，失败则允许明确重试。旧请求完成不能清除新草稿。存储损坏/不可写时失败，不冒险静默换键。

客户端离开页面会取消交付；服务器已开始的一轮继续在模型截止时间和 180 秒租约内审核保存。重新进入查看历史，无需重新付费生成。完整结果丢失时，同键重试重放原结果；过期租约允许新的 generation，迟到尝试不能覆盖新结果。外部计费不能保证严格一次，未知 Token 为 NULL，不伪造 0。计量仍分别记录输入审核、生成、输出审核。

## 设计预览

仅明确 EXPO_PUBLIC_DISCOVER_PREVIEW=1 时使用虚构成人开发角色、固定示例消息和照片卡片。Heart 可进入设计聊天页；本地输入只追加自己的预览消息，显示未连接 AI 的提示，不生成假回复、不调真实 API、不写成年同意、不授予等级/照片/订阅。预览图库只看同包开发照片；正式模式没有这些默认问候或奖励卡。

```bash
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 EXPO_PUBLIC_DISCOVER_PREVIEW=1 EXPO_PUBLIC_API_URL='' EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='' pnpm --filter @companion/mobile export:web --output-dir .local/chat-preview-web --max-workers 2
```

设计体验包：`/workspace/scratch/Flirtly-Chat-Preview.zip`。解压后在已安装 Node 的 Mac 双击“开始体验.command”，保持终端开启。初始直接打开聊天，返回可体验 Discover / Chats / Me。包中不包含契约测试构建、服务端配置或秘密凭证。浏览器设计预览不能代替 iPhone 原生验收。

## 本轮验证

- pnpm check：101 项 Jest 测试、配置测试、格式/类型、三个 SQL artifact 校验与 API 构建通过。新增测试覆盖 SDK 真实流解码、错误/截断/大小边界、审核后交付、客户端取消、待发送键恢复和租约判断。
- pnpm test:integration：10 项真实开发 Supabase/API 测试通过，含新角色详情、摘要与 SSE 权限/结果重放；模型异常相关用明确测试替身，临时数据清理完成。
- pnpm test:ai-live：1 项真实 DeepSeek 流式生成测试通过（共三次有界供应商调用：输入检查/生成/输出检查），验证状态、持久化、同键 JSON 重放及三个用量阶段，临时身份/数据清理完成。未据此宣称审核分类器的完整安全质量已验收。
- 浏览器显式 Preview：393×852、320×568 和缩小的键盘视口检查消息、照片查看、图库、列表返回及输入，无外部请求/页面异常。
- 浏览器真实客户端 + 明确 HTTP 替身：游客初始化一次、会话创建一次，重复点击只发送一次，失败后刷新恢复同一请求键、成功后历史回看。此项没有真实 AI 调用，不能代替真实匿名注册。
- iOS Hermes 资源导出通过；未做原生构建、真机键盘/流式、TestFlight 或完整匿名 App 闭环。

## 后续验收

先使匿名开关生效，配置实际开发角色和 App 可达的 API，完成新用户无需登录→角色→真实回复→重开历史的设备验收。照片等级、私有图片权限、摘要、Wallet、订阅/内购、举报与账号删除仍按后续阶段实施。

2026-11-08 流程更新见 ADR 0010：Heart 先进入独立 Match，再点 CHAT NOW 创建会话；聊天相册入口改为独立双列 Gallery。旧版弹层/直接进入聊天描述保留为开发历史，以 match-gallery.md 为最新验收。

最新免注册/免登录验收与容器部署准备见 guest-acceptance.md 和 railway-deployment.md，历史阻塞记录不再代表当前状态。
