# Discover 开发与验收

## 已实现

- 按用户 2026-11-04 参考图实现全屏人物布局：右上悬浮钻石/皇冠、名称和红色类型徽章、简介、浅色 hashtag；白底红 X 与红底白 Heart。
- 无顶部 Discover 标题、人物卡外框或额外介绍；保留简短 AI/Preview 标识。点击名称行打开资料。
- X/左滑跳过、Heart/右滑选择、角色详情；本次队列浏览完可重新浏览。
- 顶部 Diamonds 未知余额与 Premium 入口，保留 Discover / Chats / Me 三个 Tab。
- 正式模式通过真实游客 token 访问 `/v1/me`、`/v1/characters`、会话创建/列表与消息 API，不接受客户端自报用户身份。创建会话后进入基础历史/发送界面；完整流式、照片、等级和商业化仍属后续阶段。
- 消息页支持早期历史加载、发送状态、失败消息重新编辑重试；同内容重试复用 UUID，不自动重复付费生成。会话数据按用户与会话 ID 隔离缓存，离开 ready 状态时清除相关缓存。
- 读取已就绪 token 不再把身份状态切回 loading，避免真实接口接入后的反复刷新；身份丢失时仍闭锁，不静默换游客。

## 真实模式与预览模式

默认读取真实后端，没有自动演示数据回退。角色 DTO 暂无正式封面字段，没有已配置照片时显示中性占位，不随机给真实角色分配开发照片。角色发布、封面管理/授权需后续运营与图片模块完成。

仅开发导出时明确设置 `EXPO_PUBLIC_DISCOVER_PREVIEW=1`：直接打开 Discover，不写入伪造的引导同意状态；显示 Preview 标记、六位虚构成年角色和现有开发人像；停止匿名会话初始化，Heart 先展示 Match，CHAT NOW 打开独立设计聊天页，可本地输入和查看开发照片，不调用 API/AI 或创建假云端会话。Diamonds 不编造余额，Premium/购买入口不扣款、不授予权益。

预览构建：

```bash
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 EXPO_PUBLIC_DISCOVER_PREVIEW=1 EXPO_PUBLIC_API_URL='' EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='' pnpm --filter @companion/mobile export:web --output-dir .local/discover-preview-web --max-workers 2
```

正式模式需要：Supabase 开启 Anonymous Sign-Ins、提供公开 publishable key、移动端可访问的真实 API 地址、后台有已发布角色。2026-11-03 只读核对结果：匿名开关仍为 false、已发布角色数量为 0；公开 key 未在当前环境就绪。此次不创建真实游客或开发角色，未执行真实移动端游客/聊天联调。

浏览器正式接口联调须在服务端设置精确 `CORS_ALLOWED_ORIGINS`，例如 `http://127.0.0.1:8081`；HTTPS 测试站点须填实际 origin，不支持通配。iOS 原生请求不需要 CORS。正式发布 API 必须 HTTPS，明文仅在开发模式接受 localhost/私有局域网。

## 本轮验证范围

- 工程检查包含新增 API 响应校验、身份/缓存所有权、取消/超时、错误脱敏、手势/队列与 CORS 白名单测试。
- 浏览器 Preview 交互验证卡片、两个方向手势、角色详情、购买入口、浏览完重新开始及小屏；无外部请求，不把演示素材描述为正式角色库存。
- 使用真实 Supabase JS 客户端配合明确 HTTP 测试替身，验证后台游客初始化→角色→仅一次创建会话→503 后同键重试→回复与历史回看。真实 AI 调用为 0；这不是实际 Supabase 匿名注册成功证明。
- 编译后的 NestJS 实测精确 origin 预检、外部 origin 不授权与存活接口；不写数据库、不调用 AI。
- 新增 expo-crypto 按 SDK58 bundledNativeModules.json 的兼容版本安装，用于安全 UUID。web/iOS JS 导出不代表 iPhone 原生或真机已验收。

内部证据在 `/workspace/scratch/discover-preview`；对外体验包只包含 Preview 构建，不包含契约测试构建、测试凭证、服务端配置或密钥。

实际检查结果：`pnpm check` 的 85 项 Jest 测试、配置测试、类型/格式检查与 API 构建通过。Preview 浏览器交互及无外部请求验证通过；明确 HTTP 替身下会话创建只有 1 次、失败/成功两次发送复用同一请求编号，真实 AI 调用 0 次。底栏文字可见高度与 320px 小屏按钮位置已验证。iOS JS/Hermes 资源导出通过，未做原生构建/真机验收。

## 2026-11-04 视觉修订

以用户提供的 IMG_7907.PNG 为布局参考，图片为现有虚构成年角色开发素材，不把参考截图直接当成无字背景。人物延伸到屏幕上缘；浮动入口考虑原生顶部安全区。底部仍为既定三个 Tab，没有新增礼物功能。余额继续为未知，Heart 没有虚构付费锁。小于 700px 的屏幕缩小按钮/信息区域，保持底栏和主要操作可见。字体为系统/Arial 近似，并非已识别原字体。

本次视觉修订验证：85 项 Jest 测试及 pnpm check 全部通过；393×852 与 320×568 浏览器视口的滑动、详情、入口和底栏检查通过，无外部请求或页面错误。iOS Hermes 资源导出通过；未执行真机、真实游客或支付测试。新版体验包为 `/workspace/scratch/Flirtly-Discover-Preview-V2.zip`，仅包含显式 Preview 导出及 Node 本机浏览器启动器；公开截图为 docs/previews/discover.png。

后续微调：右上钻石与皇冠的可见高度由 44pt 缩至 32pt，触控高度保留至少 44pt；内部图标、余额文字和加号同步缩小。再次完成 pnpm check（85 项 Jest 测试）及浏览器交互/尺寸核对。更新体验包为 `/workspace/scratch/Flirtly-Discover-Preview-V3.zip`；本次未重复原生构建或真机测试。

聊天阶段更新：Chats 的角色/最后消息、受保护的角色详情、SSE 交付和持久化重试已接入，详见 [聊天开发说明](chat-development.md)。当前公开 key 已就绪，匿名注册仍返回 anonymous_provider_disabled；不能把设计预览称为真实 App 闭环成功。

2026-11-08 最新导航为 Heart → Match → CHAT NOW → Chat；相册为独立 Gallery，验收见 match-gallery.md。
