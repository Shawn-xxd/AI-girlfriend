# 免注册、免登录真实闭环验收

2026-11-08，Supabase Anonymous Sign-Ins 已生效。真实匿名、真实后端和真实 DeepSeek 闭环通过，用户无需输入邮箱、密码、Apple 授权或进行任何登录操作；产品不展示登录状态。

## 可重复验收

```bash
pnpm check
pnpm test:integration
pnpm test:guest-live
```

后者使用指定开发 Supabase、公开 publishable key 和真实供应商配置。前置检查发现匿名开关关闭时直接失败，在任何计费调用之前停止。不使用管理员邮箱身份或 magic link 替代匿名成功。仅在开发环境手动运行：一个用例最多一次生成及输入/输出两次内容检查，不自动重试模型。

等级照片接入后，先运行 `test:integration` 检查云端结构并建立/确认私有图片桶；`test:guest-live` 再用临时角色、测试等级规则和两张微小测试图片，验证真实 AI 保存后升级与照片访问。所有测试素材/身份清理，桶保留。正式门槛和角色素材不由测试预置。

本次实测步骤：

1. 公开 SDK 后台建立真实匿名身份，服务端验证 JWT，返回本人业务用户。
2. 获取真实角色并幂等创建会话，使用移动端实际 HTTP/SSE 传输核心发送消息。
3. DeepSeek 真实流 → 完整审核 → 事务保存 → 返回消息；记录三个用量阶段。
4. 使用同一持久化存储重新构造移动端实际会话核心及 SDK，恢复同一身份，只发生一次匿名初始化。
5. 查询历史、同键重放，数据库仅保留一次生成尝试。
6. 第二匿名身份访问该会话返回 404；测试身份、临时角色及业务数据清理。

这项测试的存储底层是测试拥有的内存，采用与原生一致的分块存储/身份标记算法，不代表 iPhone Keychain 或真机重启已验证。

## 实际浏览器验收

另一次实测运行真实 Expo 开发页及 NestJS，浏览器通过继承的代理与正常 TLS 证书校验直连 Supabase，没有 HTTP 替身、伪造游客 token 或假 AI 回复。

实际点击完整引导并填写测试偏好 → 自动匿名身份 → 真实开发角色 → Match → CHAT NOW → 真实 DeepSeek 回复 → Gallery 往返保留草稿 → 刷新恢复原身份/历史 → Chats 回看。匿名初始化、创建会话、发送分别只有一次；没有注册/登录控件或页面异常。

通过数据库持久化与浏览器 DOM 双重验证回复，不依赖浏览器开发协议直接抓取流的正文。临时浏览器身份/聊天清理，已发布开发角色保留。结果见 docs/validation/guest-browser-2026-11-08.json；内部脚本和截图在 /workspace/scratch/guest-acceptance。

## 开发角色

```bash
pnpm seed:development
pnpm seed:development --apply
```

第一条只预览清单。第二条只允许指定开发项目，先核对正式迁移，再原子插入缺失的六位开发角色；重复执行不覆盖运营修改、发布状态或已有记录。Ava / Luna / Sofia / Ruby / Isla / Mei 已写入并带 Development 标签，供正式接口联调；不是正式运营内容，没有价格、等级或图片权限配置。

真实角色封面暂未配置，正式模式保持中性占位；不会把本地开发照片自动分配为正式角色照片。

## CI 与剩余工作

新增手动 GitHub Actions guest-acceptance.yml，使用 development 环境凭证，正常 push 不运行付费验收。缺少开关或凭证会失败，不能把跳过当成功。

后端 Docker 已构建并验证非 root、只读运行、真实数据库 readiness 200 和未认证角色接口 401。Railway 配置已准备，尚未发布外部服务，见 railway-deployment.md。

后端/浏览器闭环通过不等于正式 iOS 交付。iPhone Keychain、键盘、恢复前后台、设备网络、EAS 开发构建和 TestFlight 仍待验证。2026-11-10 有效计数、等级和照片权限已通过真实云端及 DeepSeek 验收，详见 levels-development.md；轻量摘要也已完成真实生成/回忆验收，见 memory-development.md。钱包、订阅/内购及后台仍按后续阶段实施。
