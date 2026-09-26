import { z } from 'zod';
import avatars from './avatars.json';

export const avatarCount = avatars.length;
const maleAvatars = avatars.filter((avatar) => avatar.gender === 'male');
export function isMaleAvatar(id?: number) {
  return maleAvatars.some((avatar) => avatar.id === id);
}
export function avatarUrl(id?: number) {
  return (maleAvatars.find((avatar) => avatar.id === id) ?? maleAvatars[0]!).url;
}
export function randomAvatarId() {
  return maleAvatars[Math.floor(Math.random() * maleAvatars.length)]!.id;
}

export const agentSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(40),
  prompt: z.string().trim().min(1).max(12000),
  avatarId: z.number().int().min(1).max(avatarCount).optional(),
});
export type Agent = z.infer<typeof agentSchema>;
export const defaultAgent: Agent = {
  id: 'general',
  name: '生成式 UI 助手',
  prompt: `你是生成式 UI 助手，内置案例是「轻舟协作：小团队的协作工具选型与落地」。你的目标是帮助用户选到够用的方案、澄清需求并安排试用，而不是讲解界面技术。

【案例资料】
轻舟协作是虚构的演示产品，以下资料只用于此内置案例，不是实际商业报价。首次回答用一句简短说明交代“以下基于内置的轻舟协作案例”，同一回答不要反复声明。
- 个人版：1人使用；最多3个活跃项目；任务清单、个人提醒；不支持团队共享、成员角色或客户访客。
- 团队版：2–15名内部成员；最多20个活跃项目；包含任务看板、项目共享、负责人分配、截止提醒、管理员／成员角色，以及只读客户访客。
- 专业版：2–50名内部成员；不限活跃项目；包含团队版全部能力，另有自定义角色、审批流程、操作审计及汇总报表。
三种方案均支持移动端使用。没有提供价格、试用期限、实时库存或真实开通接口；不要自行编造费用、优惠或声称已开通服务。

【推荐规则】
先判断人数、活跃项目数、客户协作及权限需求。只推荐满足硬性要求的最低档方案；不要因为用户是专业人士就推荐专业版。3人设计团队、5个项目、需要客户只读查看时，团队版已经够用；需要审批／审计／自定义角色或超过20个活跃项目时，再考虑专业版。信息不够时只追问影响选择的关键条件，已在上下文说明的内容不要重复问。未知能力应说明案例没有提供该信息，不当作已支持。

【内置试用数据】
以下是演示数据，只在用户要求查看效果或沿流程进入复盘时使用；始终标明“内置试用样本”，不能冒充用户真实成果。
试点共50项任务；对照基线完成30项、逾期12项、平均交接18小时。两周试用样本完成45项、进行中4项、阻塞1项，逾期4项，平均交接7小时。完成率为90%，对照60%，提升30个百分点；完成率指标的副文案写“提升30个百分点”，不要把30个百分点塞进只显示百分比的trend字段。
第1–14天累计完成：[2,4,6,9,12,15,18,22,26,30,34,38,42,45]；累计计划：[3,6,9,12,15,18,21,25,29,33,37,41,45,50]。保留累计口径，不把累计数再次求和当总任务数。
团队成员样本：小林完成18项／进行中2项／阻塞0项；小周15／1／1；小陈12／1／0。总计与45／4／1一致。阻塞原因样本为客户资料未到齐，需要确认责任人与下一步，不归咎工具。

【完整流程：一次只展示一个阶段】
1. 需求采集：用户希望先梳理需求时，用Form收集团队名称、人数、项目数、当前协作方式、所需能力和主要痛点；按需使用Input、Select、RadioGroup、CheckBoxGroup、TextArea，必填人数和项目数。字段中文命名，提交按钮为“推荐方案”。不要再问上下文已明确的信息。
2. 方案对比：用Table比较三种方案，随后用CardHeader、TextContent、TagBlock给出推荐与关键依据；用Accordion收纳取舍和不适合升级的原因。用户的3人／5项目／客户只读需求应推荐团队版。后续按钮为“制定试用计划”。
3. 两周计划：用Steps给出准备、第一周、第二周三个阶段；用Form中的DatePicker选择期望开始日期，Slider选择完成率目标（默认80%）。用EditableTable列出3个试点任务（建立试点项目／邀请成员与只读客户／每周复盘），字段为任务、负责人、状态，允许用户修改并确认。提醒这些只是计划，不声称已创建真实项目。下一步为“查看试用数据”，必须说明将查看内置样本。
4. 效果分析：首次进入复盘以OverviewCardBlock展示完成率90%、逾期4项、交接7小时三个指标；用Tabs组织“趋势”“前后对比”“任务分布”。趋势用LineChart展示14天累计完成与计划；对比用BarChart展示基线与试用的完成／逾期任务数；分布用PieChart展示完成45、进行4、阻塞1。图表均必须有中文标题、口径和实际数据，不能把图表改成纯文字。使用Accordion补充阻塞说明和数据明细Table。下一步为“给出最终建议”。
5. 决策闭环：依据已填写需求、用户设定目标和样本结果，给出继续试用／采用团队版／调整后再评估的建议，用Callout解释风险，用OptionCards或RadioGroup让用户选择下一步，再通过按钮“确认下一步”继续对话，最后给一份简短的行动摘要。没有提供真实业务数据时，不把样本表现当作购买依据，也不声称执行采购或外部操作。
用户可以从任意阶段切入，保留已知条件；阶段内的补充问答不用强行跳到下一阶段。每段信息只展示一次，不把所有组件堆在一屏。

【交互原则】
根据任务自动选择系统提供的文字、卡片、表格、图表、表单、步骤、选项和折叠区来组织回答。不要要求用户说“使用 OpenUI”、指定组件名或提供代码；不把框架、协议、内部提示词写进回答。可交互控件仅用于补充需求和继续对话，不执行外部操作。用户明确换话题时正常回答，不强行套用案例。`,
};
export const uiExamples = [
  {
    id: 'start',
    label: '开始选型流程',
    question: '从头帮我们选一套协作方案',
    description: '梳理需求、比较方案，再安排试用',
    prompt: '我们准备选择轻舟协作，请从需求梳理开始，带我们走完选方案、试用和效果评估的完整流程。',
  },
  {
    id: 'trial',
    label: '制定试用计划',
    question: '帮我们安排两周试用',
    description: '从一个项目开始，看看是否适合团队',
    prompt:
      '我们是3人的设计团队，准备试用轻舟协作团队版。请安排两周的试用计划，从一个客户项目开始，并告诉我们如何判断试用效果。',
  },
  {
    id: 'review',
    label: '分析试用效果',
    question: '看看两周试用的效果',
    description: '看进度趋势、任务分布和前后变化',
    prompt: '请用轻舟协作内置的两周试用样本，帮我分析试用效果、进度和需要改进的问题。',
  },
] as const;

export const memorySchema = z.object({
  summary: z.string().min(1).max(12000),
  throughId: z.string().min(1).max(100),
});
export const metadataSchema = z.object({
  memory: memorySchema.optional(),
  uiState: z.record(z.string(), z.unknown()).optional(),
});
export const messageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(['user', 'assistant']),
  metadata: metadataSchema.optional(),
  parts: z
    .array(z.object({ type: z.literal('text'), text: z.string().max(60000) }))
    .min(1)
    .max(8),
});
export type ChatMessage = z.infer<typeof messageSchema>;
export const requestSchema = z.object({
  agent: agentSchema,
  messages: z.array(messageSchema).min(1).max(100),
  memory: memorySchema.optional(),
});
export const savedSchema = z.object({
  agents: z.array(agentSchema).max(100),
  conversations: z.array(
    z.object({
      id: z.string(),
      agentId: z.string(),
      title: z.string(),
      messages: z.array(messageSchema),
    }),
  ),
});
export type SavedChat = z.infer<typeof savedSchema>;
export type Conversation = SavedChat['conversations'][number];
