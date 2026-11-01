# ADR 0001：基础栈与版本

状态：基础工具版本继续采用；平台选型已由 ADR 0002 更新，原生集成仍需 iOS 验证。

原始方案采用 pnpm workspaces + 模块化单体，Railway/Neon/Clerk/R2。用户现已决定采用 Supabase 替代 Neon、Clerk 和 R2，详见 ADR 0002；NestJS、Prisma 与 Railway 保留。Next.js 后台到 Phase 5 初始化。

当前运行 Node 24.19.0、pnpm 11.25.0。Expo SDK 58.0.22 采用官方 `expo-template-blank-typescript@58.0.31` 中的 React 19.3.0、React Native 0.88.1、TypeScript 6.0.3；Router 等原生依赖对照 SDK 自带 bundledNativeModules.json。NestJS 12.3.2；Prisma 7.10.1 + PostgreSQL driver adapter。未使用注册表默认标签中的 Prisma 8 RC，也未机械安装 TypeScript 7。

证据：npm 官方包元数据、Expo 官方发布模板和 SDK 依赖映射。尝试访问 Expo/NestJS/Prisma 官方文档站点时当前网络返回 HTTP 403；不能宣称已在线核对全部文档。基础可行性通过实际构建和数据库测试验证；第三方集成时仍需检查对应官方文档。

Phase 1 的 User 最小表不代表完整领域 Schema。共享包编译成 CommonJS 用于 API，移动端从类型入口及兼容的 JS 消费契约；不得共享数据库客户端。HTTP 数据库就绪检查不披露连接信息。

已通过官方 GitHub 源码镜像读取 [Expo 创建项目文档](https://github.com/expo/expo/blob/main/docs/pages/get-started/create-a-project.mdx) 与 [NestJS README](https://github.com/nestjs/nest/blob/master/Readme.md)。Expo 文档当前推荐 SDK 58。Prisma 文档站点仍未读取成功。
