import 'server-only';
import { Type, type TSchema } from 'typebox';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AnalyticsMcpClient } from './analytics-mcp';

// 智能问数的 8 个受控数据工具,1:1 代理远端 MCP 的同名只读工具。
export const analyticsToolNames = [
  'get_context',
  'list_models',
  'describe_model',
  'list_cubes',
  'describe_cube',
  'plan_sql',
  'query_sql',
  'query_cube',
] as const;
export type AnalyticsToolName = (typeof analyticsToolNames)[number];

const toolLabels: Record<AnalyticsToolName, string> = {
  get_context: '读取业务口径',
  list_models: '浏览数据模型',
  describe_model: '查看模型字段',
  list_cubes: '浏览指标主题',
  describe_cube: '查看指标详情',
  plan_sql: '校验查询语句',
  query_sql: '执行查询',
  query_cube: '查询指标',
};

export function analyticsToolLabel(name: string): string {
  return toolLabels[name as AnalyticsToolName] ?? name;
}

const MAX_TOOL_CALLS = 12;

type CallFn = AnalyticsMcpClient['call'];

const cubeFilterSchema = Type.Object(
  {
    field: Type.String({ description: '过滤字段（维度、指标或时间维度）' }),
    operator: Type.Union(
      [
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'in',
        'not_in',
        'contains',
        'starts_with',
        'is_null',
        'is_not_null',
      ].map((op) => Type.Literal(op)),
      { description: '比较操作符' },
    ),
    value: Type.Unknown({
      description: '比较值；in/not_in 传数组，is_null/is_not_null 可省略',
    }),
  },
  { additionalProperties: false },
);

interface AnalyticsToolSpec<TParams extends TSchema> {
  name: AnalyticsToolName;
  description: string;
  parameters: TParams;
}

function makeAnalyticsTool<TParams extends TSchema>(
  spec: AnalyticsToolSpec<TParams>,
  call: CallFn,
  budget: { count: number },
) {
  // 不标注返回类型:defineTool 交出的 ToolDefinition & AnyToolDefinition 才能装进 ToolDefinition[]。
  return defineTool({
    name: spec.name,
    label: toolLabels[spec.name],
    description: spec.description,
    parameters: spec.parameters,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    executionMode: 'sequential',
    execute: async (_toolCallId, params, signal) => {
      budget.count += 1;
      if (budget.count > MAX_TOOL_CALLS) {
        return {
          content: [{ type: 'text', text: '本次回答的工具调用已达上限，请基于已有结果直接作答。' }],
          details: { elapsedMs: 0 },
          isError: true,
        };
      }
      const started = Date.now();
      const { text, isError } = await call(spec.name, params as Record<string, unknown>, signal);
      return {
        content: [{ type: 'text', text }],
        details: { elapsedMs: Date.now() - started },
        isError,
      };
    },
  });
}

export function createAnalyticsTools(call: CallFn): ToolDefinition[] {
  const budget = { count: 0 };
  return [
    makeAnalyticsTool(
      {
        name: 'get_context',
        description:
          '返回业务口径、计算规则、术语表与数据快照日期。每个分析任务开始必须先调用一次本工具。',
        parameters: Type.Object({}, { additionalProperties: false }),
      },
      call,
      budget,
    ),
    makeAnalyticsTool(
      {
        name: 'list_models',
        description: '列出全部数据模型与视图，用于发现可查询的主题域。',
        parameters: Type.Object({}, { additionalProperties: false }),
      },
      call,
      budget,
    ),
    makeAnalyticsTool(
      {
        name: 'describe_model',
        description: '查看指定模型的字段、类型与业务描述。构造自定义查询前先确认字段。',
        parameters: Type.Object(
          { name: Type.String({ description: '模型名称' }) },
          { additionalProperties: false },
        ),
      },
      call,
      budget,
    ),
    makeAnalyticsTool(
      {
        name: 'list_cubes',
        description: '列出预置的指标主题。这些主题覆盖的指标优先用 query_cube 查询。',
        parameters: Type.Object({}, { additionalProperties: false }),
      },
      call,
      budget,
    ),
    makeAnalyticsTool(
      {
        name: 'describe_cube',
        description: '查看指定指标主题的可用指标（measures）、维度（dimensions）与过滤字段。',
        parameters: Type.Object(
          { name: Type.String({ description: '指标主题名称' }) },
          { additionalProperties: false },
        ),
      },
      call,
      budget,
    ),
    makeAnalyticsTool(
      {
        name: 'plan_sql',
        description:
          '对单条只读 SELECT 做语义校验与规划，不执行。query_sql 之前必须先用本工具校验通过；SQL 只能引用数据模型名。',
        parameters: Type.Object(
          { sql: Type.String({ maxLength: 50000, description: '要校验的 SELECT 语句' }) },
          { additionalProperties: false },
        ),
      },
      call,
      budget,
    ),
    makeAnalyticsTool(
      {
        name: 'query_sql',
        description:
          '执行一条已通过 plan_sql 校验的只读 SELECT，最多返回 1000 行。聚合优先，不要拉取明细大表。',
        parameters: Type.Object(
          {
            sql: Type.String({
              maxLength: 50000,
              description: '已通过 plan_sql 校验的 SELECT 语句',
            }),
          },
          { additionalProperties: false },
        ),
      },
      call,
      budget,
    ),
    makeAnalyticsTool(
      {
        name: 'query_cube',
        description:
          '按预置指标主题查询指标，优先于自定义查询；operator 限 eq/neq/gt/gte/lt/lte/in/not_in/contains/starts_with/is_null/is_not_null。',
        parameters: Type.Object(
          {
            cube: Type.String({ description: '指标主题名称' }),
            measures: Type.Array(Type.String(), { minItems: 1, description: '要查询的指标名' }),
            dimensions: Type.Array(Type.String(), { description: '分组维度名' }),
            filters: Type.Optional(Type.Array(cubeFilterSchema, { description: '过滤条件' })),
          },
          { additionalProperties: false },
        ),
      },
      call,
      budget,
    ),
  ];
}
