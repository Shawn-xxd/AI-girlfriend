# 首次引导与免登录使用

## 本轮范围

按用户参考图从左到右、从上到下实现 12 步：启动、欢迎/成年确认、Role play、角色类型、隐私、相识、名字/代词、兴趣、偏好、目标、匹配介绍、Premium 介绍。不插入登录/注册页面。工作品牌沿用图中的 FLIRTLY；人物为六位虚构成年人的开发素材，可在后续替换。

返回保留答案，多选可取消且允许不选，姓名修剪空白并校验 1–40 字符，18+ 必须明确选择。AsyncStorage 中只保存版本化的设备引导草稿，不保存 token/余额/订阅。完成后跳过引导进入 Discover / Chats / Me 框架，Me 可查看本机答案、确认后重新体验引导。

Discover/Chats 目前是诚实空态，本轮不把它们宣称为正式角色发现或聊天界面。Premium 页可 No thanks；Subscribe/Restore 显示当前购买不可用，不扣费、不发放权益、不虚构价格。法律页面未发布时入口报告暂时无法打开，不能把本地勾选当成正式法律交付。

## 运行

```bash
pnpm install --frozen-lockfile
pnpm dev:mobile
```

当前受限云环境可内部启动 `EXPO_OFFLINE=1 pnpm --filter @companion/mobile exec expo start --web --localhost --port 8081`。浏览器只用于内部验证，不提供 loopback 用户预览链接。基础 API 检查页保留在未链接的 `/development` 路由。

新增原生模块版本取自已安装 Expo SDK 58 的 bundledNativeModules.json，因官方兼容性服务在当前策略下返回 403，使用其离线兼容版本安装；没有关闭证书或校验、升级整个技术栈。

## 真正的游客身份

用户确认整个 App 无需登录即可使用。引导完成后后台初始化 Supabase 匿名 Auth 会话，后续 API 使用真实用户 token，继续由 NestJS 验证身份。首次建立身份后会记住 UUID，刷新失败、旧凭证丢失、存储损坏或身份不符时拒绝静默新建替代身份。

iOS 使用 SecureStore：长会话分块、最后提交指针，失败保留原有内容；SDK 会话与身份标记分开保存。web 验证仅使用 sessionStorage，不宣称关闭标签或卸载后仍可恢复，更不承诺跨设备资料同步。重做引导不删除匿名账号或聊天。

当前真实游客初始化有外部前置条件：

1. 在开发 Supabase 的 Authentication 设置启用 Anonymous Sign-Ins。只读 `/auth/v1/settings` 已确认当前关闭，未代用户修改平台。
2. 安全环境设置填写 `EXPO_PUBLIC_SUPABASE_URL=https://dxpiqttvtxjhmlvxstbb.supabase.co` 与 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（必须是公开 `sb_publishable_` key，不能填 Secret/service-role）。
3. 发布后的公开 HTTPS 隐私和条款 URL 分别填入 `EXPO_PUBLIC_PRIVACY_URL`、`EXPO_PUBLIC_TERMS_URL`；开发预览可暂缺，正式发布前必须提供。
4. 保存/发布环境后重启或重新导出 Expo；公开变量在打包时内联，已有产物不会自动继承新值。

不需要新增业务 SQL，也不重跑已应用三份迁移。游客真实会话和 `/v1/me`/角色/聊天联调在前置条件准备后单独验证。不能用后端已通过的临时 Auth 测试或前端 adapter 替身冒充真实匿名登录已通过。匿名账号删除、购买恢复、跨设备恢复、限流/滥用控制在对应阶段完成，不擅自强加 Apple 登录。

## 验收

`pnpm check` 覆盖状态门槛、持久化恢复、坏数据、去重与身份失败等必要逻辑。`pnpm --filter @companion/mobile export:web` 检查浏览器构建，iOS JS/资源导出也须检查；均不等于 EAS 原生构建或真机测试。

云环境具备 Playwright 和 Chromium，可内部验证完整点击顺序、法律失败提示、多选、返回/重启保留、跳过订阅、完成跳过引导、Me 重做确认及 320px 小屏/模拟键盘。内部验收脚本与截图在 `/workspace/scratch/onboarding-browser-check.cjs`、`/workspace/scratch/onboarding-preview`。浏览器缩小视口不等于真实 iOS 键盘行为；安全区与真机仍需后续验收。

## 2026-11-01 实际结果

- `pnpm check` 通过：73 项 Jest 测试、4 项配置测试、lint/格式/类型、SQL artifact 校验与后端构建。
- Expo web 与 iOS JS/资源（Hermes）导出通过，目录 `apps/mobile/dist/web`、`apps/mobile/dist/ios`；未执行 EAS 原生构建或真机测试。
- 在静态 web 导出产物上运行 390×844 / 320×568 及缩小视口模拟键盘的浏览器交互，15 类流程检查通过、无 pageerror。覆盖输入/选择、返回保留、重启草稿、跳过/完成、三 Tab、Me 取消/确认重做；完成后绕过与重做入口使用独立 `/onboarding` 路由，避免和 Discover 的根路径冲突。
- 浏览器复核时修正了 React Native Web 选择状态的 ARIA 映射和 SVG 原生属性警告，没有隐藏错误浮层或强制点击绕过问题。
- 匿名会话的身份丢失修复使用真实 Supabase SDK + 无网络 fetch 替身复现与回归，确认刷新失败删除旧凭证后，重试/重建 manager 不会静默 signup 替代身份。不是实际平台匿名登录成功证明。
- 当前未提供移动端公开 key，平台匿名开关在最近只读检查中为关闭；真实游客访问仍未验收。订阅没有接入，法律页面尚待运营方 URL。
- 产物检查的 12 份 JS/Hermes bundle 未包含服务端密钥变量或 PostgreSQL 连接串引用；不把此项静态检查描述为完整安全审计。

已保存环境变量需求与启动说明草稿；保存草稿不等于发布环境。需要用户填写公开配置、开启匿名登录并发布后，重启/重新导出 Expo 再验证真实游客路径。
