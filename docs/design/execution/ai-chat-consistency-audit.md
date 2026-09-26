# AI 问答组件一致性审查

范围仅为 AI 问答聊天外壳、生成回答、官方弹层与图表提示；保留既有字段、业务步骤、会话记录和导航形态，不代表全站审查。

此前控件比例检查：实际输入、占位与空／已选下拉均13px，普通与聚焦状态同号；字段行高20px、padding8px 12px、10px圆角和44px最小高度，动作文字13px、40px可见／44px触控。标签和辅助说明仍12px。已通过18个填写态控件×三个视口及现有目录回放检查，见 `evidence/ai-chat-input-values/result.json`。下文16px为此前审查记录；当前规则以DESIGN.md为准。

当前通用契约与新增状态矩阵见 [OpenUI移动端组件契约](../controls/openui-mobile.md)；本报告保留已执行覆盖，不将其扩大为任意数据、任意业务或82项独立E2E全部通过。新增压力场景未取得结果前记为未跑。

## 源码覆盖

核对当前 `@openuidev/react-ui` 的全部82项 registry 定义，以及聊天 CSS、移动适配器、ThemeProvider 和主题映射。统一正文13、标签／说明12、标题15、指标18、输入16、图标14px；触控下限44px。`--chat-*` 为尺寸来源，回答与官方 body portal 使用对应别名。

本轮集中修复：

- Portal 缺失尺寸作用域；外壳欢迎／抽屉标题、创建字段标签与按钮图标脱离统一角色。
- Switch 的视觉尺寸与触控区域混用；现为44×44px按钮内绘28×18px轨道。
- 通用 radio／checkbox 焦点覆盖误伤 OptionCard；现仅去掉内部指示器的重复轮廓。
- InlineHeader、List、Switch、TextCallout及指标附属说明遗漏12px角色。
- Code 主题角色及代码块遗漏等宽字号／中性表面；复制操作只在悬停显示。
- 创建页与聊天header的层级冲突：创建页现在覆盖聊天header，返回按钮与创建标题不被遮挡。
- 禁用 accent、强调边界、highlight／sunk状态未完整映射项目主题。

## 确定性样例覆盖

`scripts/design-checks/fixtures/ai-chat-components.mjs` 使用官方 examples 加补充样例，生成10组回答；不请求模型。生成时逐组用官方 parser 检查错误／未解析引用，并检查样例中的定义名覆盖全部 registry。

| 回答索引（从0开始） | 引用的官方定义 |
| --- | --- |
| 0 | `Stack`、`TextContent`、`Table`、`Col` |
| 1 | `Stack`、`TextContent`、`BarChart`、`Series` |
| 2 | `Stack`、`TextContent`、`Form`、`FormControl`、`Input`、`Select`、`TextArea`、`SelectItem`、`Buttons`、`Button` |
| 3 | `Stack`、`TextContent`、`Tabs`、`TabItem`、`Callout` |
| 4 | `Stack`、`InlineHeader`、`SnippetCardBlock`、`SnippetCardItem`、`IconText`、`Icon`、`BoldText`、`CompositeCardBlock`、`CompositeCardItem`、`MetricIndicatorInline`、`Button` |
| 5 | `Stack`、`InlineHeader`、`EditableTable`、`Form`、`FormControl`、`OptionCards`、`OptionCard`、`Icon`、`Chips`、`ChipItem`、`Buttons`、`Button` |
| 6 | `Stack`、`Card`、`CardHeader`、`Label`、`Text`、`MarkDownRenderer`、`TextCallout`、`Callout`、`TagBlock`、`Tag`、`MetricIndicatorWithStrikethrough`、`EntityList`、`ListBlock`、`ListItem`、`Separator` |
| 7 | `Stack`、`CardHeader`、`Form`、`FormControl`、`SwitchGroup`、`SwitchItem`、`RadioGroup`、`RadioItem`、`CheckBoxGroup`、`CheckBoxItem`、`Chips`、`ChipItem`、`DatePicker`、`Slider`、`IconButton`、`Icon`、`Buttons`、`Button` |
| 8 | `Stack`、`CardHeader`、`Image`、`ImageBlock`、`ImageGallery`、`ImageText`、`ImageTextLarge`、`CodeBlock`、`ContextCardBlock`、`ContextCardItem`、`VisualCardBlock`、`VisualCardItem`、`BoldText`、`Tag`、`Carousel`、`TextContent`、`Modal` |
| 9 | `Stack`、`CardHeader`、`OverviewCardBlock`、`OverviewCardItem`、`Text`、`MetricIndicatorInline`、`LineChart`、`Series`、`AreaChart`、`RadarChart`、`HorizontalBarChart`、`RadialChart`、`SingleStackedBarChart`、`ScatterChart`、`ScatterSeries`、`Point`、`PieChart`、`Steps`、`StepsItem`、`Accordion`、`AccordionItem`、`TextContent`、`Slice` |

这里的82是**源码与样例引用覆盖**，不是82个独立可见、可交互控件的验收。`Col`、`Series`、`Point`等是父组件数据；`Slice`在补充样例中是未挂载声明；`Modal`默认关闭。动作描述符不计入82项。

## 浏览器复现与证据

先启动独立 localhost 测试站，再运行：

```sh
EGO_TASK_SPACE=<active> DESIGN_BASE_URL=http://localhost:<端口> CATALOG_ASSERT=1 sh scripts/design-checks/ai-chat-catalog.sh
```

脚本拒绝覆盖含用户记录的 origin，导入固定组件会话并回放全部10组。检查320px浅色、390px深色、1440px浅色的页面横向溢出、渲染错误、文字字号是否落在语义尺寸集合、可测按钮的44px最小高度及Switch的44×44px区域；在第2／5／6／7／8／9组保存截图。

当前 [result.json](evidence/ai-chat-catalog/result.json) 记录三组视口均无页面横向溢出、渲染错误、尺寸集合外文字或不足44px的被测按钮，Switch均为44×44px；截图在同目录。该自动检查验证字号集合，不能代替逐角色检查，也不自动点击每个控件。

状态回归：紧接目录回放运行 `EGO_TASK_SPACE=<active> sh scripts/design-checks/ai-chat-catalog-states.sh`。[states.json](evidence/ai-chat-catalog/states.json) 记录开关切换、OptionCard键盘焦点、12px校验提示、无需悬停的代码复制入口、智能体选择／创建／导航、画廊变量继承、明暗Modal打开及Escape关闭均通过。截图等待有限入场动画结束，不以中间帧判断布局。

本轮重跑移动编辑回归也通过原生日期、选择、逐项修改／撤销／确认与刷新保存。生产构建、类型检查、定向lint与字体检测通过。未验证每个图表的每个提示、所有禁用／焦点组合或真机键盘；82定义覆盖不等于82项独立交互全部组合验证。既有业务流程见 [AI 问答执行文档](ai-chat.md)。

创建页遮挡定向回归：`EGO_TASK_SPACE=<active> DESIGN_BASE_URL=http://localhost:<端口> sh scripts/design-checks/ai-chat-create-layer.sh`；[create-layer.json](evidence/ai-chat-catalog/create-layer.json) 记录320浅色／390深色／1440浅色中，标题与返回按钮实际命中测试通过、标题15px、创建页始终在手机容器内。

最终独立视觉复核完成。普通Callout与TextCallout的左边框实测均为1px，记录在 [callout-width.json](evidence/ai-chat-catalog/callout-width.json)。复核结论限定本次整体尺寸、组件视觉和已列出的状态范围。
