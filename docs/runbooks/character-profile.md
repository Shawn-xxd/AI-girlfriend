# 人物简介页面

2026-11-26 用户要求点击聊天头像打开参考图样式的人物简介页，并确认本次只做人物资料与相册/聊天入口，不做 CLEAR CHAT / DELETE。

使用现有 Expo Router 58.0.31 的独立 `/character/[id]` Stack 页面；此处 id 为已验证归属的会话 ID，与现有相册路由一致。聊天和相册头像均可进入。页面展示角色封面、姓名、定位、简介、标签，底部固定 GALLERY / CHAT。资料来自现有 conversation/catalog 缓存和 API，不暴露 system_prompt、不新增后端接口或数据库字段，不显示未经验证的在线状态。长简介、长名字和大字体允许自然换行/滚动，底部操作保留在可见区域。

沿用 React Native Image 的 cover/force-cache，复用现有封面预加载与缓存；使用已安装的 expo-linear-gradient 和安全区域组件，不新增原生依赖。页面仅在显式 discoverPreview 下使用设计角色，正式模式不以演示内容兜底。

路由使用 Expo Router navigate/dismissTo，返回原有聊天实例；相册的返回与 CHAT 分开，返回可回人物页，CHAT 直接回会话。简介页调用 useMobileViewer({ refreshOnMount: false })，避免切换资料页时刷新 viewer 使后台聊天卸载并丢失草稿。沿用 owner 分区查询和已验证匿名身份，不创建新身份、不新建会话、不改变等级、照片权限或钱包。

检查：pnpm check、普通/小屏及长资料的真实组件网页渲染、按钮行为；发布前核对 iOS fingerprint 与现有 Preview 包一致，再发布 EAS Update。网页渲染与导出不等于 iPhone 真机验收。

参考：[Expo Router navigation](https://docs.expo.dev/router/basics/navigation/)；当前依赖自带 global-state/router.d.ts 中 navigate、dismissTo 文档说明了现有 Stack 的导航及回退语义。
