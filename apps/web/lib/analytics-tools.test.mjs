import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// server-only 在非 RSC 环境会抛错；单测里替换为空模块（进程级注册，测试进程退出即失效）。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { analyticsToolNames, analyticsToolLabel, createAnalyticsTools } = await import(
  './analytics-tools.ts'
);
const { connectAnalyticsMcp, truncateToolText } = await import('./analytics-mcp.ts');

const noop = async () => {};

test('工具名清单与中文标签一一对应，未知名回退原名', () => {
  assert.deepEqual([...analyticsToolNames], [
    'get_context',
    'list_models',
    'describe_model',
    'list_cubes',
    'describe_cube',
    'plan_sql',
    'query_sql',
    'query_cube',
  ]);
  assert.equal(analyticsToolLabel('get_context'), '读取业务口径');
  assert.equal(analyticsToolLabel('query_cube'), '查询指标');
  assert.equal(analyticsToolLabel('unknown_tool'), 'unknown_tool');
});

test('8 个工具全部只读、串行执行，query_cube 过滤操作符限 12 个', () => {
  const tools = createAnalyticsTools(noop);
  assert.equal(tools.length, 8);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.executionMode, 'sequential');
    assert.ok(tool.description.length > 0);
  }
  const cube = tools.find((tool) => tool.name === 'query_cube');
  const filterItem = cube.parameters.properties.filters.items;
  const operator = filterItem.properties.operator;
  const literals = operator.anyOf ?? operator.oneOf;
  assert.equal(literals.length, 12);
  const planSql = tools.find((tool) => tool.name === 'plan_sql');
  assert.ok(planSql.parameters.properties.sql);
});

test('工具执行透传参数、透传错误并按上限拦截', async () => {
  const calls = [];
  const tools = createAnalyticsTools(async (name, args) => {
    calls.push([name, args]);
    return { text: `result:${name}`, isError: name === 'query_sql' };
  });
  const describeModel = tools.find((tool) => tool.name === 'describe_model');
  const ok = await describeModel.execute('t1', { name: 'employees' });
  assert.deepEqual(calls.at(-1), ['describe_model', { name: 'employees' }]);
  assert.equal(ok.isError, false);
  assert.equal(ok.content[0].text, 'result:describe_model');
  const querySql = tools.find((tool) => tool.name === 'query_sql');
  const failed = await querySql.execute('t2', { sql: 'SELECT 1' });
  assert.equal(failed.isError, true);

  const budget = createAnalyticsTools(async () => ({ text: 'ok', isError: false }));
  const getContext = budget.find((tool) => tool.name === 'get_context');
  const params = {};
  for (let index = 0; index < 12; index++) {
    const result = await getContext.execute(`b${index}`, params);
    assert.equal(result.isError, false);
  }
  const blocked = await getContext.execute('b12', params);
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0].text, /上限/);
});

test('超长结果被截断并注明数据不完整', () => {
  const long = 'x'.repeat(25_000);
  const truncated = truncateToolText(long);
  assert.ok(truncated.length < 25_000);
  assert.match(truncated, /数据不完整/);
  assert.equal(truncateToolText('短结果'), '短结果');
  assert.equal(truncateToolText('x'.repeat(20_000)).length, 20_000);
});

test('token 缺失时返回降级客户端：调用报错但不抛出', async () => {
  const previous = process.env.ANALYTICS_MCP_TOKEN;
  delete process.env.ANALYTICS_MCP_TOKEN;
  try {
    const client = await connectAnalyticsMcp();
    const result = await client.call('get_context', {});
    assert.equal(result.isError, true);
    assert.match(result.text, /尚未配置/);
    await client.close();
  } finally {
    if (previous === undefined) delete process.env.ANALYTICS_MCP_TOKEN;
    else process.env.ANALYTICS_MCP_TOKEN = previous;
  }
});
