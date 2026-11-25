# 聊天等级与头像进度环

2026-11-25 检查指定 Supabase 项目 dxpiqttvtxjhmlvxstbb：16 轮已完成聊天对应 16 条计数凭据、总有效次数 16，计数正常；全局规则 revision=0，只有 Lv.1 / 0，缺少后续等级门槛。高级等级不能由前端猜测或默认补齐，需用户确定后通过现有管理员全局规则入口保存。计数继续按成功保存的一来一回算一轮，失败、拒绝和同键重试不重复计数。

聊天和相册的公共 CharacterHeader 共用头像外圈。采用 Expo SDK 58 推荐且已安装的 react-native-svg 15.16.0 的 Svg/Circle；不新增依赖、不改头像裁切。外圈显示当前等级区间内的进度，等级数字继续保留：`(effectiveChatCount - currentLevelRequiredCount) / (nextLevel.requiredCount - currentLevelRequiredCount)`，结果限制在 0–1。达到新等级后从新门槛重新计；没有后续配置的 Lv.1 显示中性轨道，已达到更高配置上限时完整显示。读屏可获得当前等级和本级完成/所需轮数，不额外添加界面文案。

新增第十二份迁移 20261125032534_level_progress_interval.sql，仅扩展现有 progress snapshot JSON，返回 currentLevelRequiredCount，读取同一份全局规则计算本级与下级门槛。不改变计数、奖励、等级保留或权限逻辑，不新增数据表、服务或客户端数据库访问。函数仍为 SECURITY INVOKER，校验会话归属，只有 service_role 可执行。shared 契约的新字段为可选，以兼容旧缓存和滚动发布；旧 API 需要部署新的 shared 构建后才会透传新字段。

前端直接使用 timeline/gallery 的完整 progress，不在发送点击或动画完成时增加次数。成功回复后沿用原查询刷新读取数据库事务已经确认的进度。旧缓存缺少本级门槛时，Lv.1 可按 0 计算，后续等级使用中性轨道直到读取新快照，不推测规则间隔。

验证：本机全套隔离 SQL 迁移重复运行与并发断言、非均匀门槛 0/5/17、本级区间/封顶、跨用户拒绝；前端比例、等级提升归零、规则提高后保留等级、旧缓存；API DTO 透传；pnpm check。云端应用迁移后运行真实开发项目集成测试（AI 替身、临时数据清理），部署只指向既有 abundant-abundance/production/AI-girlfriend，移动端 fingerprint 核对后发布 Preview 热更新。实际执行状态另存发布验证记录，不以代码完成代替线上验收。

参考：[Expo react-native-svg](https://docs.expo.dev/versions/latest/sdk/svg/)、[Supabase Database Functions](https://supabase.com/docs/guides/database/functions)。
