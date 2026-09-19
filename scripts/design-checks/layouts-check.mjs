import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// 布局参考行为回归：对齐 docs/design/README.md 布局契约（八本书架与双页画册、
// 单跨页翻页步长与边界禁用、页码目录直接定位、图片点击放大即详情、Esc 分层退出、
// 搜索定位缺图条目、无效分类回退书架、窄屏无横向溢出）。
// 翻页预取断言守护「翻入页必须在翻页动画前完成请求」的既有行为。
const baseURL = (process.env.DESIGN_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const evidenceURL = new URL('../../docs/design/execution/evidence/layouts-check.json', import.meta.url);
const evidence = { baseURL, checks: {}, pageErrors: [] };
const browser = await chromium.launch({ headless: true });
const settle = (page) => page.waitForTimeout(900);
const readingStatus = (page) =>
  page.locator('[aria-label$="画册"] p[role="status"]').getAttribute('aria-label');
const waitForStatus = (page, previous) =>
  page.waitForFunction(
    (prev) => document.querySelector('[aria-label$="画册"] p[role="status"]')?.getAttribute('aria-label') !== prev,
    previous,
    { timeout: 5000 },
  );
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));

  // 书架：八本分类书，全量数据下无禁用书脊，缺筛选时只有邀请提示。
  await page.goto(`${baseURL}/products/layout-compositions`, { waitUntil: 'domcontentloaded' });
  const books = page.locator('[class*="shelf"] button');
  const bookCount = await books.count();
  assert(bookCount === 8, `书架应有 8 本分类书，实际 ${bookCount}`);
  const disabledBooks = await books.locator(':disabled').count();
  assert(disabledBooks === 0, '全量数据下不应有禁用书脊');
  assert(await page.getByText('选一本，翻开看看。', { exact: true }).isVisible(), '缺少书架邀请提示');
  evidence.checks.shelf = { books: bookCount };

  // 打开第一本：URL 记录 cat/page，画册定位第 1–2 跨页，起点「上一页」禁用。
  const thumbRequests = new Set();
  page.on('request', (request) => {
    if (request.url().includes('/thumbnails/')) thumbRequests.add(request.url());
  });
  await books.first().click();
  await page.locator('select[aria-label="跳转到图鉴"]').waitFor();
  assert(new URL(page.url()).searchParams.get('cat') === '构图逻辑', '开册应把 cat 写入 URL');
  const status0 = await readingStatus(page);
  assert(status0 === '第1至2页，共86页', `初始跨页应为第1至2页，实际「${status0}」`);
  assert(await page.getByRole('button', { name: '上一页' }).isDisabled(), '起点「上一页」应禁用');
  assert(await page.locator('[aria-label="第1页"]').isVisible(), '左页缺少页码');
  assert(await page.locator('[aria-label="第2页"]').isVisible(), '右页缺少页码');

  // 「下一页」步长恰为一个跨页；方向键同样翻一跨页。
  await page.getByRole('button', { name: '下一页' }).click();
  await waitForStatus(page, status0);
  const status1 = await readingStatus(page);
  assert(status1 === '第3至4页，共86页', `按钮翻页应到第3至4页，实际「${status1}」`);
  await page.locator('button[data-page-id]').first().focus();
  await page.keyboard.press('ArrowRight');
  await waitForStatus(page, status1);
  const status2 = await readingStatus(page);
  assert(status2 === '第5至6页，共86页', `方向键应翻到第5至6页，实际「${status2}」`);
  assert(await page.locator('[aria-label="第5页"]').isVisible(), '翻页后左页页码未更新');

  // 翻页预取：点击前快照已请求集合；本次翻入的第 7–8 页必须已在预取期请求，
  // 而非翻页后由 img 自身拉取（否则动画中会闪现）。
  const requestedBeforeFlip = new Set(thumbRequests);
  await page.getByRole('button', { name: '下一页' }).click();
  await waitForStatus(page, status2);
  await settle(page);
  const shownSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-book-spread] img')).map((img) => img.src),
  );
  assert(shownSrcs.length === 2, `当前跨页应显示 2 张图，实际 ${shownSrcs.length}`);
  const missingSrcs = shownSrcs.filter((src) => !requestedBeforeFlip.has(src));
  assert(missingSrcs.length === 0, `翻入页未预取即显示：${missingSrcs.join(', ')}`);
  evidence.checks.prewarm = { flippedTo: '第7至8页', prewarmedBeforeClick: true };

  // 页码目录直接定位：末页边界与任意页。
  const picker = page.locator('select[aria-label="跳转到图鉴"]');
  await picker.selectOption({ index: 85 });
  await settle(page);
  const lastStatus = await readingStatus(page);
  assert(lastStatus === '第85至86页，共86页', `目录跳末页应为第85至86页，实际「${lastStatus}」`);
  assert(await page.getByRole('button', { name: '下一页' }).isDisabled(), '末跨页「下一页」应禁用');
  await picker.selectOption({ index: 4 });
  await settle(page);
  const jumpStatus = await readingStatus(page);
  assert(jumpStatus === '第5至6页，共86页', `目录跳第5页应为第5至6页，实际「${jumpStatus}」`);

  // 图片点击放大即详情；Esc 关闭放大后焦点回到当前书页。
  await page.locator('button[data-page-id]').first().click();
  await page.locator('[role="dialog"]').waitFor();
  const zoomedId = await page.evaluate(() =>
    document.querySelector('[data-book-spread] button[data-page-id]')?.getAttribute('data-page-id'),
  );
  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  assert(
    (await page.evaluate(() => document.activeElement?.getAttribute('data-page-id'))) === zoomedId,
    '关闭放大后焦点应回到触发的书页',
  );

  // Esc 关画册回书架，书脊焦点恢复。
  await page.keyboard.press('Escape');
  await page.locator('select[aria-label="跳转到图鉴"]').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.id === 'book-0', undefined, { timeout: 5000 });
  evidence.checks.escExits = 'zoom→page, reader→spine focus restored';

  // 无效分类：静默回书架，不崩溃也不伪造画册。
  await page.goto(`${baseURL}/products/layout-compositions?cat=unknown`, { waitUntil: 'domcontentloaded' });
  await page.getByText('选一本，翻开看看。', { exact: true }).waitFor();
  assert(new URL(page.url()).searchParams.get('cat') === 'unknown', '无效 cat 应保留在 URL');

  // 搜索定位缺图条目：063 缺图但保留书页，占位明确且无放大假入口。
  await page.goto(`${baseURL}/products/layout-compositions?q=063`, { waitUntil: 'domcontentloaded' });
  await page.locator('[aria-label="图鉴搜索结果"]').waitFor();
  assert(await page.getByText('1 条图鉴', { exact: true }).isVisible(), '搜索 063 应只命中 1 条');
  await page.locator('[aria-label="图鉴搜索结果"] button').last().click();
  await page.locator('button[data-page-id="063"]').waitFor();
  const missingStatus = await readingStatus(page);
  // 契约：画册沿搜索结果筛选，只含命中的 063 一页。
  assert(missingStatus === '第1至1页，共1页', `搜索打开应为单页画册，实际「${missingStatus}」`);
  assert(await page.getByText('此图鉴暂缺图片').isVisible(), '缺图条目应显示缺图占位');
  assert(await page.locator('button[data-page-id="063"]').isDisabled(), '缺图页不应提供放大入口');
  await page.keyboard.press('Escape');
  await page.locator('select[aria-label="跳转到图鉴"]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '清除筛选' }).click();
  await page.getByText('选一本，翻开看看。', { exact: true }).waitFor();

  // 窄屏：书架与画册都不得产生页面级横向溢出。
  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 } });
  narrow.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  await narrow.goto(`${baseURL}/products/layout-compositions`, { waitUntil: 'domcontentloaded' });
  await narrow.locator('[class*="shelf"] button').first().waitFor();
  assert(
    await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    '窄屏书架出现横向溢出',
  );
  await narrow.locator('[class*="shelf"] button').first().click();
  await narrow.locator('select[aria-label="跳转到图鉴"]').waitFor();
  assert(
    await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    '窄屏画册出现横向溢出',
  );
  await narrow.close();
  evidence.checks.narrow = '390px shelf and reader without page overflow';

  assert(evidence.pageErrors.length === 0, `页面报错：${evidence.pageErrors.join(' | ')}`);
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await browser.close();
  await mkdir(new URL('../../docs/design/execution/evidence/', import.meta.url), { recursive: true });
  evidence.passed = !evidence.failure;
  await writeFile(evidenceURL, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}
