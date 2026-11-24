# 聊天输入框与最新消息

点击输入框时定位最新消息。保留现有 KeyboardAvoidingView：iOS 使用 padding，Android 沿用系统窗口避让，不叠加 ScrollView 的自动键盘 inset，避免重复留白。

原来的 onContentSizeChange 只处理消息高度变化；键盘和多行输入框改变的是聊天可见高度。本次增加 ScrollView.onLayout，在可见高度变化且正在跟随底部时重新 scrollToEnd。iOS keyboardWillShow 到 keyboardDidShow 之间保持跟随，结束后校准；Android 使用 keyboardDidShow。无固定延时、轮询、新原生依赖或输入状态持久化改动。

输入框聚焦或新一次弹出键盘时主动回到最新消息，并退出此前的历史分页位置保持。手动拖动消息列表可取消自动跟随；键盘仍打开时可以继续阅读历史。没有聚焦输入框时，原有加载历史的 prepend 保持逻辑照常执行。收起键盘、输入框多行增高时，位于底部的消息随可见区域调整。

交付检查：pnpm check、Preview runtime fingerprint、发布后的 manifest。编译/导出不能替代 iPhone 真机键盘动画验收。

真机重点检查：

- 长聊天停在底部，点击输入框后，最新消息应在输入栏上方保持可见。
- 收起后再次弹出，以及中英文/表情键盘高度切换。
- 输入多行文字、发送消息后输入栏回缩。
- 上翻历史后点击输入框回到最新；键盘打开后手动上翻不强制拉回。
- 未操作输入框时加载更早消息，阅读位置应保持。

依据：[React Native KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview)、[Keyboard 事件](https://reactnative.dev/docs/keyboard)、[ScrollView](https://reactnative.dev/docs/scrollview)。
