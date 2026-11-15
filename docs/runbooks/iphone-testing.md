# iPhone 内部测试

## 当前状态

已准备 Preview 独立安装包配置、SDK 58 的开发客户端/更新模块、三个更新通道和构建前检查。iOS 原生工程生成、iOS/Web 资源导出及后端容器可在云环境验证；这些结果不代表已经生成签名 IPA 或在 iPhone 安装。

用户已确认有 Apple Developer Program 付费账号。Railway 后端已上线：`https://ai-girlfriend-production-fa0cc107.up.railway.app`。本轮只读探针确认 live/ready 均为 200，未认证 characters/wallet 均为 401。Expo 项目权限与 Preview 公开环境已通过 EAS 核验；Apple Preview Bundle ID、分发证书和包含测试 iPhone 的 ad hoc 描述文件已配置，首个签名 IPA 构建成功。iPhone 安装与功能验收仍待进行。Supabase 六份迁移已生效，不用再执行 SQL。

## 1. 准备手机可访问的后端

现有 Railway 服务已完成部署，不要重复创建。后续维护继续使用 `Shawn-xxd/AI-girlfriend` 的 `main` 分支；Root Directory 保持仓库根目录，由 `railway.json` 使用现有 Dockerfile。服务端配置维护见 [Railway 部署说明](railway-deployment.md)。

手机需要真实 HTTPS API 域名。Codex 云环境中的 localhost、内部端口和 Mac 上旧预览包不能当作手机公网地址。Railway 不会自动继承 Codex 中的 Supabase/模型凭证；这些变量需在 Railway 安全设置中配置。

有地址后运行以下只读检查，不发送任何用户或模型凭证：

```bash
pnpm verify:deployed-api https://ai-girlfriend-production-fa0cc107.up.railway.app
```

必须 live/ready 为 200，未认证 characters/wallet 为 401。服务器 health 成功仍需后续真实聊天验收，不能替代模型密钥检查。

## 2. 关联 Expo 项目和 Bundle ID

当前配置已填写用户确认的公开身份，并通过 EAS 核验项目权限：

| 配置                  | 值                                     |
| --------------------- | -------------------------------------- |
| Expo owner            | `shawnxiao66s-team`                    |
| Expo slug             | `ai-girlfriend`                        |
| EAS project ID        | `8937031e-1e1f-47ea-a874-02c0c0c6e669` |
| 基础 Bundle ID        | `com.tempta.ai`                        |
| Preview Bundle ID     | `com.tempta.ai.preview`                |
| Development Bundle ID | `com.tempta.ai.development`            |

Preview Bundle ID `com.tempta.ai.preview` 已在 Apple 注册并完成签名配置；不代表基础 production Bundle ID 已在 Apple 注册。`EXPO_TOKEN` 仅通过安全环境变量提供；五项 preview 公开配置已同步并读回验证，值不写入验收记录。已核验一台启用的 iPhone。

在 [Expo Dashboard](https://expo.dev/) 创建或选择项目，取得项目 UUID 与账号/组织名称。确认正式基础 Bundle ID。它们是公开配置，可由开发者写入 `apps/mobile/app.json` 的 `extra.eas.projectId`、`owner`、`ios.bundleIdentifier`；当前不填虚假的项目 ID 或猜测正式包名。

动态配置会从公开静态配置读取项目身份，方便 EAS 首次查找项目和下载环境变量；也接受 `EAS_PROJECT_ID` / `IOS_BUNDLE_IDENTIFIER`，但与已关联身份冲突时停止。基础 Bundle ID 不带 `.preview`，工具会自动添加测试后缀。

Expo 的 `preview` 环境只配置下列公开值：

| 名称                                 | 内容                                |
| ------------------------------------ | ----------------------------------- |
| APP_VARIANT                          | preview                             |
| EXPO_PUBLIC_API_URL                  | Railway 实际 HTTPS 根地址，不带 /v1 |
| EXPO_PUBLIC_SUPABASE_URL             | 当前开发 Supabase URL               |
| EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 项目的 sb*publishable* 公开密钥     |
| EXPO_PUBLIC_DISCOVER_PREVIEW         | 0                                   |

没有静态关联时还需要 EAS_PROJECT_ID 和 IOS_BUNDLE_IDENTIFIER；建议先关联公开身份，再同步环境。production 必须独立配置正式数据项目、后端及合法页面，构建会拒绝已知开发 Supabase。

服务端 Secret key、DeepSeek Key 和 RevenueCat 服务端密钥只留在 Railway。若由 Codex 使用 EAS CLI，Expo access token 仅通过云环境安全变量 `EXPO_TOKEN` 配置，不能发到聊天或写入 Git。外连时按实际需要允许 Expo API、更新/上传域名和实际 Railway 域名，不复用原数据库 TCP 连接方案。

## 3. 首次签名与设备

首次由 EAS 正式关联 Apple 团队并生成/选择分发证书及 ad hoc provisioning profile，登记该 iPhone 的 UDID。可在授权环境运行：

```bash
cd apps/mobile
pnpm dlx eas-cli@27.7.2 device:create
```

Apple 凭证只按 EAS 的安全授权流程处理。已有 Apple Developer 账号不等于本项目已有签名。首次配置尚未完成时，不直接用非交互命令假装能生成证书。

## 4. 构建、安装与后续更新

以下命令从 `apps/mobile` 执行。先在允许的环境关联 Expo 账号，再下载公开 preview 配置。首次下载时用 development 解析身份，避免缺少尚未下载的 preview 环境导致配置循环。

```bash
APP_VARIANT=development pnpm dlx eas-cli@27.7.2 env:pull --environment preview
APP_VARIANT=preview pnpm check:device-config
pnpm build:preview
```

`build:preview` 先检查配置，再请求 EAS 构建。服务端 EAS post-install hook 先编译共享契约并再次检查构建环境，避免 Monorepo 新机器缺少 shared/dist。官方 EAS 配置解析器 27.7.2 已校验三个 profile。

构建成功后在 iPhone 打开 EAS 生成的安装链接。只有 provisioning profile 包含该设备时才能安装。首次安装后，包内 JS 可独立运行，不需要 Codex 会话或某台 Mac 开着。API 服务仍需正常运行。

修改兼容的 JS/图片资源后：

```bash
pnpm update:preview --message '描述本次修改'
```

命令固定 preview channel/environment，并先构建共享契约。更新默认在启动时后台下载，下次冷启动生效；测试时可能需要完全关闭再打开一次。没有新增面向产品用户的开发说明或更新按钮。新增原生模块、权限、修改 Bundle ID 或升级 SDK 后，按 fingerprint runtime 重新生成安装包；不能只推 JS。

development 使用独立 development channel、Bundle ID 和 URL scheme；只有 development 添加 Dev Client 自动生成的 URL scheme，避免 Preview 与正式包争用开发链接。Preview 是 Release 安装包，未开启 developmentClient。production 走 App Store/TestFlight 配置。当前 `.preview` 包用于 UI/聊天；未来支付沙盒需使用与对应 App Store Connect 应用/商品一致的 Bundle ID 和独立更新通道/服务端环境，不能把正式商品直接当成 `.preview` 已可购买。支付阶段单独实施并验收。

## 本地可选方式

Expo Go 只用于已支持 SDK 的初步界面/聊天测试；不能验收真实内购。Mac 的 Node 24 / pnpm 已配置后，可在源码根运行 `pnpm dev:mobile`，真机与该 Mac 同网并提供可达 API。开发客户端用 `pnpm --filter @companion/mobile start:dev-client`。这些不是当前已提供的公网/安装链接，也不是云开发的必需步骤。

## 首个真机验收清单

首次引导/年龄确认、免登录进入、Discover/Match/Chats/Gallery 导航；真实 AI 回复与失败重试；键盘、安全区、滚动与草稿；照片原卡片打开；杀进程/重启后身份与历史；后台恢复及网络切换；更新下载与重启。真实素材、正式价格/等级配置、举报/删除/后台、内购及上架验收仍分阶段完成。

## 2026-11-12 本轮结果

`pnpm check` 通过（131 项 Jest、3 个 setup 测试文件），另直接执行 11 项构建配置检查和 4 项部署探针契约检查。官方 `@expo/eas-json@27.7.2` 解析三个 profile 通过；使用明确测试身份配置导出 iOS Hermes/Web 并生成 iOS 工程，验证更新 URL、fingerprint 及独立 scheme；客户端导出中未发现已配置服务端密钥值。

本机后端镜像以 UID 1000 / 只读文件系统运行，真实开发 Supabase readiness 200，当前镜像迁移版本为 20261111000100，未认证 characters/wallet 均 401。没有请求模型或支付，也没有创建 EAS 付费构建、上传 TestFlight 或安装 iPhone。用户已确认尚未创建 Expo 和 Railway 项目，平台关联是下一步。证据见 `docs/validation/iphone-testing-preparation-2026-11-12.json`。

## 首个 Preview 签名构建

- EAS build：`54260e90-d3f4-4ae0-be7f-ded864d28116`，状态 `FINISHED`。
- 版本：`0.1.0 (1)`；Bundle ID：`com.tempta.ai.preview`；channel：`preview`；真机 internal distribution。
- [构建与安装页面](https://expo.dev/accounts/shawnxiao66s-team/projects/ai-girlfriend/builds/54260e90-d3f4-4ae0-be7f-ded864d28116)。
- EAS 已生成签名 IPA；尚未确认 iPhone 安装、启动、真实聊天或冷启动身份恢复。未上传 TestFlight。
- 构建上传包含当前工作区的依赖升级和公开身份配置；EAS 记录的 Git HEAD 为 `3d75411`，并不表示这些工作区修改已提交或推送 GitHub。
- `ITSAppUsesNonExemptEncryption` 尚未明确填写；未来 TestFlight/App Store 阶段需按实际加密使用情况完成出口合规声明，本次 ad hoc 构建已成功。
