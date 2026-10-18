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
const motionEvidence = [];
const conversationSelector = '[data-conversation-id]';
async function sampleConversation(page, action) {
  await page.evaluate((selector) => {
    const surface = document.querySelector(selector);
    const oldThread = surface.querySelector('section[aria-label="对话"]');
    const header = document.querySelector('main header');
    window.__conversationSamples = [];
    window.__conversationActionDone = false;
    window.__conversationSampleDone = new Promise((resolve) => {
      let actionDoneAt = 0;
      // Sampling window starts after the triggering action returns, so locator
      // latency is not charged to the animation; it stays bounded for still cases.
      const capture = () => {
        const current = document.querySelector(selector);
        const style = getComputedStyle(current);
        window.__conversationSamples.push({
          id: current.dataset.conversationId,
          oldMounted: oldThread.isConnected,
          oldVisible: current.contains(oldThread),
          inert: current.inert,
          x: new DOMMatrixReadOnly(style.transform).m41,
          opacity: Number(style.opacity),
          headerStable:
            header === document.querySelector('main header') &&
            getComputedStyle(header).transform === 'matrix(1, 0, 0, 1, 0, 0)' &&
            getComputedStyle(header).opacity === '1',
        });
        if (window.__conversationActionDone && !actionDoneAt)
          actionDoneAt = performance.now();
        if (actionDoneAt && performance.now() - actionDoneAt > 1200) resolve();
        else requestAnimationFrame(capture);
      };
      capture();
    });
  }, conversationSelector);
  try {
    await action();
  } finally {
    await page.evaluate(() => {
      window.__conversationActionDone = true;
    });
  }
  await page.evaluate(() => window.__conversationSampleDone);
  const samples = await page.evaluate(() => window.__conversationSamples);
  motionEvidence.push(samples);
  return samples;
}
function assertConversationPair(samples, direction) {
  const oldId = samples[0].id;
  const firstNew = samples.findIndex((sample) => sample.id !== oldId);
  assert(firstNew > 0, 'conversation commits after old DOM was sampled');
  assert(
    samples.slice(0, firstNew).every((sample) => sample.oldMounted && sample.oldVisible),
    'old conversation DOM stays mounted throughout exit',
  );
  assert(
    samples.slice(firstNew).every((sample) => !sample.oldMounted),
    'old DOM unmounts only when the new conversation commits',
  );
  assert(
    samples
      .slice(0, firstNew)
      .some(
        (sample) =>
          sample.inert && sample.x * direction < -0.1 && sample.opacity > 0 && sample.opacity < 1,
      ),
    'outgoing conversation visibly translates and fades in its intended direction',
  );
  assert(
    samples
      .slice(firstNew)
      .some(
        (sample) =>
          sample.x * direction > 0.1 && sample.opacity > 0 && sample.opacity < 1 && !sample.inert,
      ),
    'incoming conversation visibly arrives from the opposite side',
  );
  assert(
    samples.every((sample) => sample.headerStable),
    'header stays mounted and still',
  );
  const final = samples.at(-1);
  assert.equal(final.x, 0);
  assert.equal(final.opacity, 1);
  assert.equal(final.inert, false);
}
async function assertConversationSettled(page) {
  await page.waitForFunction((selector) => {
    const surface = document.querySelector(selector);
    return (
      surface &&
      !surface.inert &&
      surface.getAnimations().length === 0 &&
      getComputedStyle(surface).opacity === '1' &&
      new DOMMatrixReadOnly(getComputedStyle(surface).transform).m41 === 0
    );
  }, conversationSelector);
  assert.equal(
    await page.locator(`${conversationSelector} > section[aria-label="对话"]`).count(),
    1,
  );
}
await withBrowser(
  async ({ page, context, errors }) => {
    try {
      await fetch('http://127.0.0.1:3907/reset');
      await page.goto(`${base.origin}/products/ai-chat`);
      await page.locator(conversationSelector).waitFor();
      assert.equal(
        await page
          .locator(conversationSelector)
          .evaluate((surface) => surface.getAnimations().length),
        0,
        'hydration does not animate the restored conversation',
      );
      await page.getByRole('button', { name: '生成式 UI 助手', exact: true }).click();
      assertConversationPair(
        await sampleConversation(page, () =>
          page
            .getByRole('dialog', { name: '选择智能体', exact: true })
            .getByRole('button', { name: '智能问数', exact: true })
            .click(),
        ),
        1,
      );
      await page.getByRole('button', { name: '公司现在有多少在职员工?', exact: true }).waitFor();
      await page.getByRole('button', { name: '智能问数', exact: true }).click();
      const currentId = await page
        .locator(conversationSelector)
        .getAttribute('data-conversation-id');
      const unchanged = await sampleConversation(page, () =>
        page
          .getByRole('dialog', { name: '选择智能体', exact: true })
          .getByRole('button', { name: '智能问数', exact: true })
          .click(),
      );
      assert(
        unchanged.every(
          (sample) => sample.id === currentId && sample.x === 0 && sample.opacity === 1,
        ),
        'selecting the current agent does not replay conversation motion',
      );
      checks.push('hydration stays still; agent switching adds paired conversation continuity');
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
      assertConversationPair(
        await sampleConversation(page, () =>
          page.getByRole('button', { name: '新建对话', exact: true }).click(),
        ),
        1,
      );
      await page.getByRole('button', { name: '打开导航', exact: true }).click();
      const historyItem = page
        .getByRole('navigation', { name: '历史对话', exact: true })
        .getByRole('button')
        .filter({ hasText: '步骤状态验收' });
      assertConversationPair(await sampleConversation(page, () => historyItem.click()), -1);
      assert.match(await page.locator('[data-answer-body]').last().innerText(), /528/);
      await page.getByRole('button', { name: '打开导航', exact: true }).click();
      const restoredId = await page
        .locator(conversationSelector)
        .getAttribute('data-conversation-id');
      const restored = await sampleConversation(page, () => historyItem.click());
      assert(
        restored.every((sample) => sample.id === restoredId && sample.x === 0 && !sample.inert),
        'selecting the current history record stays still',
      );
      await page.getByRole('button', { name: '打开导航', exact: true }).click();
      assertConversationPair(
        await sampleConversation(page, () =>
          page
            .getByRole('dialog', { name: '对话', exact: true })
            .getByRole('button', { name: '新建对话', exact: true })
            .click(),
        ),
        1,
      );
      // Dispatch rapid real control intents in one browser turn; rAF samples the rendered surfaces.
      const rapid = await sampleConversation(page, () =>
        page.evaluate(async () => {
          const surface = document.querySelector('[data-conversation-id]');
          const originalId = surface.dataset.conversationId;
          document.querySelector('header [aria-label="新建对话"]').click();
          await new Promise((resolve) => setTimeout(resolve, 55));
          const before = getComputedStyle(surface);
          const position = {
            x: new DOMMatrixReadOnly(before.transform).m41,
            opacity: Number(before.opacity),
          };
          document.querySelector('[aria-label="打开导航"]').click();
          await new Promise(requestAnimationFrame);
          const history = [...document.querySelectorAll('nav[aria-label="历史对话"] button')].find(
            (button) => button.textContent.includes('步骤状态验收'),
          );
          history.click();
          await new Promise(requestAnimationFrame);
          const after = getComputedStyle(surface);
          window.__conversationReverse = {
            originalId,
            before: position,
            after: {
              x: new DOMMatrixReadOnly(after.transform).m41,
              opacity: Number(after.opacity),
            },
          };
        }),
      );
      const reverse = await page.evaluate(() => window.__conversationReverse);
      assert(
        Math.abs(reverse.before.x - reverse.after.x) < 4 &&
          Math.abs(reverse.before.opacity - reverse.after.opacity) < 0.25,
        'in-flight reverse starts from the actual rendered transform and opacity',
      );
      assert.equal(rapid.at(-1).id, restoredId, 'latest history intent wins over pending new chat');
      assert(
        !rapid.some((sample) => sample.id !== reverse.originalId && sample.id !== restoredId),
        'superseded new chat never mounts',
      );
      await assertConversationSettled(page);
      assert(
        await page
          .getByRole('button', { name: '打开导航', exact: true })
          .evaluate((button) => button === document.activeElement),
        'focus returns to stable navigation control',
      );
      checks.push(
        'both new-chat controls and history restore preserve real old/new DOM and directions',
      );
      checks.push('rapid reverse uses rendered position, drops stale intent and clears inert');
      const interruptedEntry = await sampleConversation(page, () =>
        page.evaluate(async () => {
          const surface = document.querySelector('[data-conversation-id]');
          const oldId = surface.dataset.conversationId;
          document.querySelector('header [aria-label="新建对话"]').click();
          const deadline = performance.now() + 600;
          while (surface.dataset.conversationId === oldId && performance.now() < deadline)
            await new Promise(requestAnimationFrame);
          if (surface.dataset.conversationId === oldId)
            throw new Error('conversation did not commit');
          await new Promise(requestAnimationFrame);
          document.querySelector('header [aria-label="新建对话"]').click();
          document.querySelector('header [aria-label="新建对话"]').click();
        }),
      );
      const mountedIds = [...new Set(interruptedEntry.map((sample) => sample.id))];
      assert.equal(
        mountedIds.length,
        3,
        'interrupted entrance commits the initial new chat and only the latest repeated intent',
      );
      await assertConversationSettled(page);
      await page.getByRole('button', { name: '打开导航', exact: true }).click();
      await historyItem.click();
      await assertConversationSettled(page);
      await page.getByRole('button', { name: '打开导航', exact: true }).click();
      const cancelToCurrent = await sampleConversation(page, () =>
        page.evaluate(async () => {
          document.querySelector('dialog button[class*="drawerNew"]').click();
          await new Promise((resolve) => setTimeout(resolve, 55));
          document.querySelector('[aria-label="打开导航"]').click();
          await new Promise(requestAnimationFrame);
          document.querySelector('nav[aria-label="历史对话"] [aria-current="true"]').click();
        }),
      );
      assert(
        cancelToCurrent.every((sample) => sample.id === restoredId && sample.oldMounted),
        'reselecting current history reverses the exit without remounting or losing its draft',
      );
      await assertConversationSettled(page);
      const interruption = await sampleConversation(page, () =>
        page.evaluate(async () => {
          document.querySelector('header [aria-label="新建对话"]').click();
          await new Promise((resolve) => setTimeout(resolve, 45));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        }),
      );
      assert.notEqual(interruption[0].id, interruption.at(-1).id);
      assert(
        interruption.some((sample) => sample.inert),
        'policy changes during a real outgoing animation',
      );
      assert(
        interruption
          .filter((sample) => sample.id !== interruption[0].id)
          .every((sample) => sample.x === 0 && sample.opacity === 1 && !sample.inert),
        'switching to keyboard settles pending selection with no incoming movement',
      );
      await assertConversationSettled(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reduced = await sampleConversation(page, () =>
        page.getByRole('button', { name: '新建对话', exact: true }).click(),
      );
      assert(
        reduced.every((sample) => sample.x === 0 && sample.opacity === 1 && !sample.inert),
        'reduced motion commits without spatial animation',
      );
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const keyboard = await sampleConversation(page, async () => {
        await page.getByRole('button', { name: '新建对话', exact: true }).focus();
        await page.keyboard.press('Enter');
      });
      assert.notEqual(keyboard[0].id, keyboard.at(-1).id);
      assert(
        keyboard.every((sample) => sample.x === 0 && sample.opacity === 1 && !sample.inert),
        'keyboard activation commits without spatial animation',
      );
      await assertConversationSettled(page);
      checks.push(
        'keyboard and reduced-motion new chats commit immediately without inert leftovers',
      );
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
      await page.getByRole('button', { name: '智能问数', exact: true }).click();
      await page.getByRole('button', { name: '创建智能体', exact: true }).click();
      await page.getByRole('textbox', { name: '名称', exact: true }).fill('动效验收助手');
      await page.getByRole('textbox', { name: '系统提示词', exact: true }).fill('用简洁中文回答。');
      const created = await sampleConversation(page, () =>
        page.getByRole('button', { name: '创建并开始对话', exact: true }).click(),
      );
      assert.notEqual(created[0].id, created.at(-1).id);
      assert(
        created.every((sample) => sample.x === 0 && sample.opacity === 1 && !sample.inert),
        'creation success uses its existing screen exit without a second conversation sequence',
      );
      await page.getByRole('button', { name: '动效验收助手', exact: true }).waitFor();
      await assertConversationSettled(page);
      checks.push(
        'creation success starts the new agent without duplicate conversation choreography',
      );
      assert.deepEqual(errors, [], 'no uncaught page errors');
      await writeEvidence(new URL('analytics-browser-result.json', evidence), {
        passed: true,
        checks,
        states,
        motionEvidence,
      });
      console.log(checks);
    } catch (error) {
      await page.screenshot({ path: new URL('analytics-failure.png', evidence).pathname });
      await writeEvidence(new URL('analytics-browser-result.json', evidence), {
        passed: false,
        checks,
        error: error.message,
        pageErrors: errors,
        motionEvidence,
      });
      throw error;
    } finally {
      await context.close();
    }
  },
  { contextOptions: { ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } } },
);
