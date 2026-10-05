// Deterministic browser acceptance against run-chat.mjs and the local model/data fixtures.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { baseUrl, withBrowser, writeEvidence } from './harness.cjs';

const base = new URL(baseUrl('https://upgrade-check.personal-design.localhost'));
assert.equal(base.protocol, 'https:');
assert.equal(base.hostname, 'upgrade-check.personal-design.localhost');
const evidence = new URL('../../.impeccable/review/chat-checks/', import.meta.url);
await mkdir(evidence, { recursive: true });
const checks = [];
await withBrowser(async ({ page, context, errors }) => {
  try {
    await fetch('http://127.0.0.1:3907/reset');
    await page.goto(`${base.origin}/products/ai-chat`);
    await page.getByRole('button', { name: '生成式 UI 助手', exact: true }).click();
    await page
      .getByRole('dialog', { name: '选择智能体', exact: true })
      .getByRole('button', { name: '智能问数', exact: true })
      .click();
    await page.getByRole('button', { name: '公司现在有多少在职员工?', exact: true }).waitFor();
    // Observe DOM states only: the application remains the sole response-body reader.
    await page.evaluate(() => {
      window.__analyticsSteps = [];
      const capture = () => {
        const steps = [...document.querySelectorAll('[aria-label="查询进度"] p')].map((step) => ({
          label: step.textContent.trim(),
          state: step.dataset.state,
        }));
        if (steps.length) window.__analyticsSteps.push(steps);
      };
      new MutationObserver(capture).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-state'],
      });
    });
    await page
      .getByRole('textbox', { name: '发消息给智能问数', exact: true })
      .fill('步骤状态验收：公司现在有多少在职员工？');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    const progress = page.getByRole('status', { name: '查询进度', exact: true });
    await progress.waitFor();
    await page.screenshot({ path: new URL('analytics-progress.png', evidence).pathname });
    await page.getByRole('button', { name: '重新生成', exact: true }).waitFor({ timeout: 30000 });
    assert.deepEqual(
      await page.getByRole('alert').filter({ hasText: /\S/ }).allTextContents(),
      [],
      'request completes without a visible error',
    );
    assert.equal(await progress.count(), 0, 'progress collapses after the answer starts');
    const states = await page.evaluate(() => window.__analyticsSteps);
    for (const state of ['running', 'done', 'error']) {
      assert(
        states.some((steps) => steps.some((step) => step.state === state)),
        `observed ${state} tool state`,
      );
    }
    const text = await page.locator('[data-answer-body]').last().innerText();
    assert.match(text, /528/);
    assert(!/我先读取业务口径/.test(text), 'pre-tool prose must not appear');
    const requests = await (await fetch('http://127.0.0.1:3907/requests')).json();
    const results = requests.at(-1).messages.filter((message) => message.role === 'tool');
    assert.deepEqual(
      results.map((message) => message.tool_call_id),
      ['call_get_context', 'call_describe_cube', 'call_query_cube'],
    );
    assert.match(results[0].content, /2026-08-31/);
    assert.match(results[1].content, /Fixture: metric definition temporarily unavailable/);
    assert.match(results[2].content, /528/);
    checks.push(
      'fresh analytics agent has its own examples and renders the local MCP fixture answer',
    );
    checks.push('tool progress changes through running, done and error, then collapses');
    await page.screenshot({ path: new URL('analytics-answer.png', evidence).pathname });
    await page.getByRole('button', { name: '新建对话', exact: true }).click();
    await page
      .getByRole('textbox', { name: '发消息给智能问数', exact: true })
      .fill('慢速回答：停止检查');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await progress.waitFor();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await page.getByRole('button', { name: '发送消息', exact: true }).waitFor();
    await progress.waitFor({ state: 'hidden' });
    assert.equal(await progress.count(), 0);
    checks.push('stopping an analytics request restores the composer and removes progress');
    assert.deepEqual(errors, [], 'no uncaught page errors');
    await writeEvidence(
      new URL('analytics-browser-result.json', evidence),
      { passed: true, checks, states },
    );
    console.log(checks);
  } catch (error) {
    await page.screenshot({ path: new URL('analytics-failure.png', evidence).pathname });
    await writeEvidence(
      new URL('analytics-browser-result.json', evidence),
      { passed: false, checks, error: error.message, pageErrors: errors },
    );
    throw error;
  } finally {
    await context.close();
  }
}, { contextOptions: { ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } } });
