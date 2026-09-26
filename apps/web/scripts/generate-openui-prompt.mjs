import { readFile, writeFile } from 'node:fs/promises';
import { openuiLibrary, openuiPromptOptions } from '@openuidev/react-ui/genui-lib';
const prompt = openuiLibrary.prompt({
  ...openuiPromptOptions,
  bindings: true,
  additionalRules: [
    ...openuiPromptOptions.additionalRules,
    'root只定义一次且必须是首行，先在根树中列全本次回答的内容和必要操作，再逐一补齐定义。不要输出root = root =，不要遗漏按钮引用。',
    '所有组件使用同一套视觉层级：普通内容不使用夸张大字、额外标题或装饰卡片；按钮优先medium，图标用统一中性线性样式。字号、圆角、间距和控件高度由应用统一管理，不生成CSS或自行发明尺寸。',
    '默认使用中文，遵循用户指定语言。仅输出合法OpenUI协议，不向用户讲解渲染框架；用户询问代码时使用CodeBlock。根据任务语义选择内容、数据、表单或操作，不把所有回答都变成流程表单。',
    '最高优先级移动交互规则：所有回答按320–480px手机容器设计，即使外部浏览器很宽也不能改成桌面布局。Stack/Card一律column，Card使用clear作为内容分组，不给每一段套边框，不嵌套卡片；禁止多列仪表盘、左右主从栏和固定宽度。',
    '按任务组织信息，先给结论或当前问题，细节可放Accordion/Tabs。只有需要用户填写时使用表单；单组建议4–6个字段，较长内容合理分组，不删除必要字段或强行分步。标签始终可见、位于字段上方，字段全宽；从有限选项中选择时优先Select、RadioGroup、CheckBoxGroup。',
    '只在确有下一步时提供按钮，无需操作的答案允许仅有内容。主要按钮使用medium，默认一个主操作和一个次操作，Buttons使用row并放在内容或表单下方；操作区铺满手机内容宽度，单按钮整行，两个短按钮等宽并排，窄容器或三个以上按钮纵向排列。每组只允许一个primary主操作；其他重要操作用secondary，详情等低优先级操作用tertiary；破坏性操作不可作为默认primary。按钮文案是短中文动词，不使用图标代替必要文字，不提供仅hover可见的操作或桌面快捷键。',
    '图标使用Lucide中性线性图标，只表达状态或动作，不放emoji、彩色图标底板或装饰品牌标志。用户未提供品牌素材时不生成外链Logo，产品识别沿用聊天页已有的头像与名称。',
    '只读Table优先展示2–4个核心维度；维度较多时使用分组或内部横滑保留完整数据，允许表格内部横滑但不造成整个页面横向滚动。EditableTable会在手机端以逐项展开的字段卡片显示，长列表按合理分组组织，不为满足视觉数量限制丢弃数据。操作说明写“展开条目修改”，不要提双击单元格、右键或悬停。',
    '每个图表块先说明指标与口径，默认240px绘图区，通常优先2–3个数据系列；多个分析维度用不超过3个短标签的Tabs切换。给出中文标题、单位及简短读图结论；不依赖悬停提示才能理解数据。',
    '指标采用紧凑的标签／数字行，数字简短，说明用一句话，不使用多层卡片或装饰性图标底板。日期采用DatePicker，选项采用Select，实际渲染由系统转换成移动端原生选择控件；不要自行构造桌面弹层。',

    '只使用定义的组件。图表和指标必须来自用户、当前上下文或智能体提供的明确数据；示例数据显式标注，不编造实时结果。没有数据时显示可理解的空状态，不把缺失值当作0。当前运行环境无外部工具，不使用Query或Mutation，不编造外链图片。',
    '同一组件引用在一条回答中只出现一次，避免卡片内外重复按钮。相同内容只呈现一次。',
    '表单name和字段name使用稳定、可读的名称，选择值保持上下文一致。提交使用Action([@ToAssistant("确认并继续")])这一结构，消息文案只简短描述当前任务的下一步，不拼接字段清单或重复表单内容；完整表单值由宿主作为结构化context附加；不得默认推荐某个方案或自动套用内置案例。',
    '按组件语义使用：Tabs切换平级视图，Accordion收纳可选细节，Steps表达真实有序步骤，Form采集数据，EditableTable修改结构化条目。图表依据数据关系选择，不能只为展示组件而添加。',
    '流程优先在当前回答内完成；Modal仅用于确有必要的短暂聚焦操作，不能代替普通内容布局。保留键盘顺序、可见焦点和清楚的操作反馈。长文字允许换行，内容为空、部分生成或出错时提供明确状态，不裁剪关键信息。',
  ],
});
const destination = new URL('../lib/openui-system-prompt.json', import.meta.url);
const content =
  JSON.stringify(
    { libraryVersion: '0.16.3', prompt, schema: openuiLibrary.toJSONSchema() },
    null,
    2,
  ) + '\n';
if ((await readFile(destination, 'utf8').catch(() => '')) !== content)
  await writeFile(destination, content);
console.log(`OpenUI official library: ${Object.keys(openuiLibrary.components).length} components`);
