// Official examples plus a deterministic catalog probe; never calls a model.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { openuiLibrary, openuiExamples } = require('@openuidev/react-ui');
const examples = openuiExamples.map((x) => x.slice(x.indexOf('root =')));
examples.push(
  `root = Stack([Card([CardHeader("文字与状态", "统一的辅助说明")]), Label("字段标签"), Text("text", "正文", "次级说明"), MarkDownRenderer("## 内容标题\\n正文与 **重点**。\\n\\n- 第一项\\n- 第二项"), TextCallout("info", "操作提示", "请核对填写信息"), Callout("error", "校验失败", "请检查必填字段"), TagBlock(["普通","标签"], "lg"), Tag("成功", null, "lg", "success"), Tag("注意", null, "sm", "warning"), MetricIndicatorWithStrikethrough("18", "数据说明", "22"), EntityList([{left:"项目",right:"协作平台"},{left:"数量",right:"18",rightVariant:"number"}]), ListBlock([ListItem("条目标题", "条目说明")]), Separator()])`,
  `root = Stack([CardHeader("选择和操作", "包含禁用与选中状态"), Form("audit", actions, [FormControl("通知", SwitchGroup("switches", [SwitchItem("开启通知", "接收进度提醒", "notice", true)], "card")), FormControl("单选", RadioGroup("radio", [RadioItem("第一项", "单选说明", "one"),RadioItem("第二项", "长一点的选项说明", "two")], "one")), FormControl("多选", CheckBoxGroup("check", [CheckBoxItem("勾选项目", "多选辅助说明", "one", true)])), FormControl("选择标签", Chips("chips", "multiple", [ChipItem("one", "可选"),ChipItem("two", "不可选", null, true)])), FormControl("开始日期", DatePicker("date", "range")), FormControl("目标", Slider("target", "continuous", 0,100,1,[50],"目标比例"))]), IconButton("查看详情", Icon("info"), Action([@ToAssistant("查看详情")]), "secondary", "large", "square")])
actions = Buttons([Button("主操作", Action([@ToAssistant("继续")]), "primary", "normal", "large"),Button("次操作", Action([@ToAssistant("返回")]), "primary", "normal", "small"),Button("文字操作", Action([@ToAssistant("更多")]), "tertiary")])`,
  `root = Stack([CardHeader("媒体与卡片", "本地图片"), Image("示例头像", src), ImageBlock(src,"示例头像"), ImageGallery([{src:src,alt:"头像预览",details:"辅助说明"}]), ImageText(src,"头像","图片标题","图片说明",true,"vertical",80), ImageTextLarge(src,"头像","大图标题","大图说明"), CodeBlock("javascript", "const message = 'hello';"), ContextCardBlock([ContextCardItem("a","背景卡片","卡片说明"),ContextCardItem("b","第二张卡片","另一个说明")],"carousel"), VisualCardBlock([VisualCardItem(BoldText("text","视觉卡片","辅助说明"),"a",src,Tag("示例"),"头像"),VisualCardItem(BoldText("text","另一张卡片","辅助说明"),"b",src,null,"头像")],"carousel"), Carousel([[TextContent("第一张")],[TextContent("第二张")]]), Modal("弹出内容", false, [TextContent("弹出说明")])])
src = "/ai-chat/avatars/007.webp"`,
  `root = Stack([CardHeader("其他图表", "各类型统一主题"), OverviewCardBlock([OverviewCardItem("kpi",Text("text","完成率"),MetricIndicatorInline("90%","样本数据"))]), LineChart(["一","二","三"],[Series("样本",[10,20,15])]), AreaChart(["一","二","三"],[Series("样本",[10,20,15])]), RadarChart(["一","二","三"],[Series("样本",[10,20,15])]), HorizontalBarChart(["一","二","三"],[Series("样本",[10,20,15])]), RadialChart(["完成","进行"],[70,30]), SingleStackedBarChart(["完成","进行"],[70,30]), ScatterChart([ScatterSeries("样本",[Point(1,2,3),Point(2,3,4)])]), PieChart(["完成","进行"],[70,30]), Steps([StepsItem("第一步","操作说明"),StepsItem("第二步","后续说明")]), Accordion([AccordionItem("one","展开详情",[TextContent("详情说明")])])])
unusedSlice = Slice("完成",70)`,
);
const { createParser } = require('@openuidev/react-lang');
for (const text of examples) {
  const result = createParser(openuiLibrary.toJSONSchema(), openuiLibrary.root).parse(text);
  if (result.meta.errors.length || result.meta.unresolved.length)
    throw Error(JSON.stringify(result.meta));
}
const used = new Set(examples.flatMap((x) => [...x.matchAll(/\b([A-Z]\w*)\(/g)].map((m) => m[1])));
const missing = Object.keys(openuiLibrary.components).filter((x) => !used.has(x));
if (missing.length) throw new Error('Missing coverage: ' + missing.join(', '));
const fixture = {
  id: 'component-fixture',
  agentId: 'general',
  title: '组件全量检查',
  messages: examples.map((text, i) => ({
    id: 'catalog-' + i,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  })),
};
writeFileSync(
  new URL('./ai-chat-components.json', import.meta.url),
  JSON.stringify(fixture, null, 2) + '\n',
);
console.log({
  components: Object.keys(openuiLibrary.components).length,
  examples: examples.length,
});
