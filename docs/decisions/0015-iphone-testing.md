# ADR 0015：iPhone 内部测试与更新通道

状态：2026-11-12 实施配置与本机验证；尚无 Railway 公开地址、EAS 项目或签名安装包。

## 目标与选择

用户希望方便地在手机检查现有页面、交互和真实聊天。先提供持续使用的内部测试通道，再接 RevenueCat/Apple 支付及其余后台工作。保留 Expo/TypeScript，产品全程没有注册或登录页面。

首次通过 EAS internal distribution 安装签名的 iPhone Preview 包，包内含 JS，可独立启动，不依赖 Codex 容器/Metro 持续运行。后端通过 Railway HTTPS 提供现有 NestJS API。后续兼容的 JS/资源变更通过 EAS Update 的 preview channel 获取；新增原生模块、权限或 SDK 变化需要新包，使用 fingerprint runtime 避免不兼容更新。

## 隔离与构建约束

- development、preview、production 使用不同 Bundle ID / URL scheme / 更新 channel。基础 Bundle ID 和 EAS project ID 由用户实际平台项目提供，不创建虚假的已关联项目。
- 本地 Expo Go 保持可启动，未关联 EAS 时禁用在线更新。EAS 构建必须提供完整公开配置，不允许 localhost/私网 API 或把设计 Preview 开关带进真实包。
- 首个 preview 可明确连接现有开发 Supabase；这不代表已完成独立 Staging/Production 数据隔离。production 构建禁止连接已知开发项目，并要求正式隐私政策与条款 URL。
- 所有凭证仍只在 NestJS 服务器。客户端只有公开 HTTPS API、Supabase URL、publishable key、EAS project ID 等配置；不把服务端密钥放入 extra 或 EXPO_PUBLIC 环境。
- 不增加用户页面、开发说明文案或登录入口。构建检查与操作提示仅在开发工具和文档中。

## 平台接入边界

仓库没有 EXPO_TOKEN、EAS project ID、最终 Bundle ID 或 Railway HTTPS API 配置。先完成可检查的配置、依赖、验证脚本和操作指南，再收集平台配置；不凭空宣称已经可扫码安装。用户已确认有 Apple Developer Program 付费账号。iOS ad hoc 分发仍需要已登记 UDID 和正确签名；EAS 平台登录及设备登记不等于产品用户登录。

## 验收

验证环境缺失/混用时失败、公开配置无密钥、SDK 58 兼容依赖、Expo web/iOS 导出与 iOS 原生配置生成、生产 API 容器启动/六份迁移 readiness/匿名拒绝。实际 EAS 签名、安装、iPhone 键盘/安全存储/前后台及真实购买需要平台配置和设备后再验收，不用资源导出替代。

依据：Expo 官方 Internal distribution、Runtime versions、Environment variables、Monorepos 文档，2026-11-11 核对。
