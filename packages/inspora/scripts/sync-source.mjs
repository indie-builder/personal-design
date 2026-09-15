export function extractInitialPage(html) {
  const text = rscText(html);
  const marker = '"initialPage":';
  const index = text.indexOf(marker);
  const page = index < 0 ? null : JSON.parse(extractBalancedObject(text, index + marker.length));
  if (
    !Array.isArray(page?.items) ||
    !(page.nextCursor === null || typeof page.nextCursor === 'string')
  ) {
    throw new Error('页面缺少有效 initialPage，可能是校验页或上游结构变化');
  }
  return page;
}

// 完整发现后才交给调用方写库，分页失败不会留下会截断下次增量的半页数据。
export async function collectFeed(
  categories,
  knownIds,
  fetchPage,
  { full = false, maxPages = Infinity } = {},
) {
  const items = new Map();
  for (const category of categories) {
    let cursor = null;
    let complete = false;
    for (let page = 0; page < maxPages; page++) {
      const data = await fetchPage(category, cursor);
      if (!Array.isArray(data.items)) throw new Error(`${category}: 列表数据无效`);
      for (const item of data.items) {
        if (!full && knownIds.has(item.id)) {
          complete = true;
          break;
        }
        items.set(item.id, item);
      }
      cursor = data.nextCursor;
      if (!cursor) complete = true;
      if (complete) break;
    }
    if (!complete) throw new Error(`${category}: 未覆盖到已入库作品或列表末尾，请提高 --max-pages`);
  }
  return [...items.values()];
}

function rscText(html) {
  const payloads = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m;
  while ((m = re.exec(html))) payloads.push(JSON.parse(m[1]));
  return payloads.join('');
}

/** 从详情页 HTML 的 __next_f payload 中提取含 sourceUrl 的帖子对象 */
export function extractDetailPost(html, postId) {
  const text = rscText(html);

  // 帖子对象可能出现多次（详情 + 相关推荐），取含 sourceUrl 的那个
  const marker = `{"id":"${postId}"`;
  let idx = text.indexOf(marker);
  while (idx >= 0) {
    const obj = extractBalancedObject(text, idx);
    if (obj) {
      try {
        const parsed = JSON.parse(obj);
        if (parsed.sourceUrl || parsed.description) return parsed;
      } catch {
        // 不是纯 JSON（含 RSC 引用），继续找下一个
      }
    }
    idx = text.indexOf(marker, idx + 1);
  }
  return null;
}

/** 从 start（必须是 '{' 前一个字符的位置）开始提取配平的大括号串，字符串感知 */
function extractBalancedObject(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
