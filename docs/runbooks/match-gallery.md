# 匹配与相册界面验收

2026-11-08，按用户两张参考图调整。决策见 ADR 0010。

## 行为

- Discover Heart / 右滑 → /match/:characterId。全屏人物、白色返回、ITS A / 粉红斜体 MATCH、红色 CHAT NOW。此时不创建会话。
- CHAT NOW → 幂等打开真实会话 → 替换为 /conversation/:id；显式 Preview 才创建本地设计会话。重复点击有锁，不自动调用 AI。
- 聊天相册按钮 → /gallery/:conversationId 独立页面。顶部头像/类型/钻石/聊天入口；下方两列照片、模糊锁定卡片、解锁条件和返回聊天横幅。
- All photos 展示两种照片；PRIVATE 是 Diamond Photos 的视图入口，底层仍为 Level / Diamond。没有额外 Free / Premium 类型。
- 顶部返回/聊天图标、底部横幅均回到同一聊天，保留未发送输入。Gallery 挂载不主动刷新已就绪 viewer，深链无缓存仍执行认证和归属查询。
- 聊天内的 OPEN 在原照片卡片中展开清晰图片，卡片尺寸、聊天滚动位置及输入草稿保持；展开状态按角色保留于本次预览，往返相册或从 Chats 重进不会重新模糊。独立 Gallery 的照片查看方式沿用原实现。此修改不新增服务端照片权限或钻石扣费。

## 数据与预览边界

目前正式照片、进度和 Wallet API 尚未实现，因此正式 Gallery 显示空态；不以开发照片兜底，不提供客户端扣钻或授予权限开关。角色资料只从受保护的会话详情读取，不信任路由名称/头像。

只有 EXPO_PUBLIC_DISCOVER_PREVIEW=1 才显示四张设计卡片：已解锁 Level 1、Level 2 模糊锁定、两张 7 Diamonds 示例。这些数字只存在于 gallery/preview.ts，不是正式价格/门槛。PRIVATE 只过滤视图，不解锁。点击锁定卡只提示；只有已解锁示例可打开本地开发图片，余额始终未知。所有人物仍为既有虚构成人开发素材。

## 检查

- pnpm check：101 项 Jest 测试、配置/格式/类型和 API 构建通过。无数据库或 AI 逻辑修改，没有执行真实付费模型调用。
- Preview 浏览器：393×852 与 320×568；双击 Heart、匹配返回不创建会话、CHAT NOW、双列布局/切换、锁定保持锁定、照片查看、返回与草稿保留通过；无外部请求/页面异常，也不写入伪造成年同意。
- 明确 HTTP 替身下正式客户端：Heart 后会话创建次数为 0，CHAT NOW 双击只创建 1 次；Gallery 不刷新 viewer、不清除草稿、不显示预览照片；原有失败后刷新同键重试及历史回看通过。此项不能作为真实匿名注册、解锁或支付验收。
- iOS Hermes 资源导出通过；尚未做 iPhone 真机验收。

## 体验

源码运行使用 pnpm dev:api / pnpm dev:mobile；真实模式仍需要匿名身份、公开配置、已发布角色和可达 API。

设计体验包为 `/workspace/scratch/Flirtly-Match-Gallery-Preview.zip`。完整解压后在已安装 Node 的 Mac 双击“开始体验.command”，从 Discover 点 Heart 开始。包仅含显式预览，无服务端配置、密钥或正式扣费。截图见 docs/previews/match.png 和 gallery.png。

2026-11-08 原位展开修订：最新包为 `/workspace/scratch/Flirtly-Chat-Inline-Preview.zip`，使用独立端口 8777。已从实际 ZIP 解压验证 393×852、320×568 两种尺寸：OPEN 后卡片位置/尺寸、输入框位置和草稿保持，URL 与导航历史不变，无全屏 Modal；往返 Gallery、重新进入同角色聊天保留展开状态，不影响其他角色。无外部请求、真实 AI 调用或页面异常。`pnpm check`（102 项 Jest 测试）与 web 导出通过；未重复原生构建或真机测试。
