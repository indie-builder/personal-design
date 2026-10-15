import 'server-only';
import { Type, type TSchema } from 'typebox';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AnalyticsMcpClient } from './analytics-mcp';

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

const specs = {
  get_context: {
    label: '读取业务口径',
    description:
      '返回业务口径、计算规则、术语表与数据快照日期。每个分析任务开始必须先调用一次本工具。',
    parameters: Type.Object({}, { additionalProperties: false }),
  },
  list_models: {
    label: '浏览数据模型',
    description: '列出全部数据模型与视图，用于发现可查询的主题域。',
    parameters: Type.Object({}, { additionalProperties: false }),
  },
  describe_model: {
    label: '查看模型字段',
    description: '查看指定模型的字段、类型与业务描述。构造自定义查询前先确认字段。',
    parameters: Type.Object(
      { name: Type.String({ description: '模型名称' }) },
      { additionalProperties: false },
    ),
  },
  list_cubes: {
    label: '浏览指标主题',
    description: '列出预置的指标主题。这些主题覆盖的指标优先用 query_cube 查询。',
    parameters: Type.Object({}, { additionalProperties: false }),
  },
  describe_cube: {
    label: '查看指标详情',
    description: '查看指定指标主题的可用指标（measures）、维度（dimensions）与过滤字段。',
    parameters: Type.Object(
      { name: Type.String({ description: '指标主题名称' }) },
      { additionalProperties: false },
    ),
  },
  plan_sql: {
    label: '校验查询语句',
    description:
      '对单条只读 SELECT 做语义校验与规划，不执行。query_sql 之前必须先用本工具校验通过；SQL 只能引用数据模型名。',
    parameters: Type.Object(
      { sql: Type.String({ maxLength: 50000, description: '要校验的 SELECT 语句' }) },
      { additionalProperties: false },
    ),
  },
  query_sql: {
    label: '执行查询',
    description:
      '执行一条已通过 plan_sql 校验的只读 SELECT，最多返回 1000 行。聚合优先，不要拉取明细大表。',
    parameters: Type.Object(
      { sql: Type.String({ maxLength: 50000, description: '已通过 plan_sql 校验的 SELECT 语句' }) },
      { additionalProperties: false },
    ),
  },
  query_cube: {
    label: '查询指标',
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
} satisfies Record<string, { label: string; description: string; parameters: TSchema }>;
type AnalyticsToolName = keyof typeof specs;
export const analyticsToolNames = Object.keys(specs) as AnalyticsToolName[];
const toolLabels = Object.fromEntries(
  Object.entries(specs).map(([name, spec]) => [name, spec.label]),
);
export function analyticsToolLabel(name: string): string {
  return toolLabels[name] ?? name;
}

export function createAnalyticsTools(call: AnalyticsMcpClient['call']): ToolDefinition[] {
  let count = 0;
  return Object.entries(specs).map(([name, spec]) =>
    defineTool({
      name,
      ...spec,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      executionMode: 'sequential',
      execute: async (_toolCallId, params, signal) => {
        if (++count > 12) {
          return {
            content: [
              { type: 'text', text: '本次回答的工具调用已达上限，请基于已有结果直接作答。' },
            ],
            details: { elapsedMs: 0 },
            isError: true,
          };
        }
        const started = Date.now();
        const { text, isError } = await call(name, params as Record<string, unknown>, signal);
        return {
          content: [{ type: 'text', text }],
          details: { elapsedMs: Date.now() - started },
          isError,
        };
      },
    }),
  );
}
