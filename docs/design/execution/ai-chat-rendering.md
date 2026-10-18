# AI 问答生成式 UI 实现契约

本文件维护官方库、协议校验、状态回传和移动端适配的实现要求。返回 [AI 问答运行与配置入口](ai-chat.md)；产品流程见 [产品契约](../products/ai-chat.md)，视觉数值见 [局部视觉标准](../standards/ai-chat.md)，任意业务的通用控件职责见 [OpenUI 组件契约](../controls/openui-mobile.md)。

## 官方生成式 UI

通用能力按 [OpenUI移动端组件契约](../controls/openui-mobile.md)维护：Renderer管样式、布局和安全交互，生成提示管组件选择与阅读建议，领域知识与默认案例管业务。通用提示不默认推荐方案或套用试点流程；无需填写或下一步的答案允许无Form／Button。表单4–6字段、表格2–4核心维度等均为分组建议，必须保留必要字段与完整数据。`Save Changes`回传采用“请根据我更新的内容继续”。

统一使用 `@openuidev/react-ui` 0.16.3 的 `openuiLibrary`，包含82个组件定义，由官方 `Renderer` 流式渲染。`apps/web/scripts/generate-openui-prompt.mjs` 在 dev/build 时从同一库生成服务端提示词与校验 schema，避免前后端定义漂移。

服务端结束前用官方 parser 检查缺失根节点、未解析引用、结构错误和未挂载的组件；需要时在同一 Pi 会话追加一次结构修正。错误仍未解决则提示重试。根 Stack 按 statementId 去除同一内容组件的重复引用，不按文字去重；不提供旧协议或纯文本双轨渲染。

表单交互通过官方 `onAction` 回传，用户消息只展示简短操作描述，提交字段默认折叠在“查看已提交内容”内；结构化 `formState` 与 `formName` 保存于消息 metadata，服务端按官方 content/context 信封传给模型，当前请求、历史恢复与摘要输入共用同一转换；`onStateUpdate`／`initialState` 保存与恢复输入状态。只允许继续对话和控件本地交互，不执行 Query／Mutation／外部业务操作。移动端组件适配由 `ai-chat-mobile-library.tsx` 统一维护，保留官方 schema 与状态／校验接口：内容布局统一纵向、回答／portal／编辑动作组铺满容器，单个满行；两个短操作在内容容器宽于320px时等宽并排，容器不宽于320px或三个及以上操作则全部纵向满行，Select／DatePicker改为原生控件，EditableTable改为逐项展开、细线分隔的字段行；确认操作仍使用官方 onAction 回传。主题适配限定 `.ai-openui`，官方样式只在全局入口按 Tailwind 层顺序导入一次。`ai-chat.module.css` 的 `.page --chat-*` 集中定义正文13／标签12／说明12／标题15／指标18／输入13px、回答图标14px及44px控件下限，`ai-chat-ui.module.css` 通过 `answer-*` 别名继承；`ai-chat-ui-theme.ts` 将官方类型与全部图表 palette 映射至同一亮暗主题。Card去外框、选择行采用中性选中底色，只读表格保留单边界及内部横滑，指标采用紧凑标签／数值行。外壳与回答统一缩小一号：头像32px、全部外壳标题15px、消息／列表13px，输入区内边距6px 8px 6px 12px；回答组间距12px、字段／表格容器均10px圆角，回答动作及编辑确认／撤销共用13px文字、20px行盒、10px圆角和至少44px高度；消息操作图标继承14px。`--chat-input-size` 引用正文13px，统一文本／邮箱／密码／数字／URL／多行输入、已选下拉与非空选项、日期、滑块数值、编辑条目、composer、创建表单及portal字段；实际值、占位、空／已选下拉均13px，聚焦前后同号；标签和辅助说明仍12px。OpenUI及创建页字段行高20px、padding为8px 12px、最小高44px；生成TextArea最小80px，按内容自然增高。文字按钮width为100%、padding为10px 12px，网格间距8px；移除靠边小胶囊和用于缩小可见表面的透明边界。每组最多一个primary；渲染器的actionHierarchy将重复primary或破坏性primary降为secondary，动作顺序和payload不变。编辑确认用primary、撤销用描边default。聊天导航、发送和复制沿用图标形态，全站其他按钮规则不变。Tabs／Accordion／Chips控件文字13px；表格数据13px／表头12px、单元格padding为8px 12px。Radio／Checkbox行上下padding为6px，OptionCard为10px并自然增高，Switch行上下padding为2px。回答组间距12px、表单gap16px、既有240px图表和无220px上限的圆图保持不变。浏览器原生缩放继续可用，不添加禁缩放viewport；Menu／Plus形态、业务字段与流程、会话记录保持不变。

补充一致性规则：body portal／图表 tooltip 显式共享聊天尺寸；代码使用12px等宽字体与中性底、复制常显；列表／开关／InlineHeader／TextCallout辅助文字12px。Switch为44px真实触控按钮内绘28×18px轨道，OptionCard保留可见焦点，禁用／强调／highlight／sunk状态走项目主题。82项源码检查与目录回放的历史覆盖、结果和限制见 [一致性审查](ai-chat-consistency-audit.md)。

参考：[官方完整组件库](https://www.openui.com/docs/api-reference/react-ui)、[Renderer](https://www.openui.com/docs/openui-lang/renderer)。

## 移动端按钮依据与项目取舍

- [Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)建议同组按钮用视觉样式表达主次，避免靠不同尺寸制造强调。本项目采用同组统一尺寸、最多一个primary；“每组一个”是项目约束。
- [Material Button](https://developer.android.com/develop/ui/compose/components/button)区分filled的高强调主操作、outlined的中强调次操作和text的低强调操作。本项目用填充确认与描边撤销表达层级，不靠缩小撤销按钮。
- [WCAG 2.1 SC 2.5.5](https://www.w3.org/WAI/WCAG21/Understanding/target-size)是AAA级目标尺寸要求，提出44×44 CSS px并列出例外；不是所有WCAG等级都强制44px。Apple的pt、Android的dp与Web的CSS px是不同平台单位，不能当作同一测量单位互换。

本项目保留13 CSS px文字及至少44 CSS px操作目标。单操作满宽、宽于320px的内容容器容纳两个等宽短操作、窄容器或三个以上操作纵向排列，是针对手机聊天和窄框阅读的设计判断，不是上述官方规范要求所有按钮满宽的通用规定。导航、发送、复制仍保留图标操作；布局调整不改变动作语义或顺序。这些设计依据本身不构成验收通过的证据。
