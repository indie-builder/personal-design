import { createFileRoute } from '@tanstack/react-router';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * /_image 图像优化路由：收口 next/image 缺失（迁移报告 R1）。
 * 契约对齐 next/image 核心语义：
 * - url：本地 public 路径（traversal 安全，query 仅接受媒体目录的 ?v= 版本参数）或
 *   热链白名单域名的 https 绝对地址；拒绝其余来源与私网/本地 host 字面量（SSRF 基线）
 * - w：只接受 next/image 同款档位（imageSizes + deviceSizes），其余 400
 * - q：1–100 整数，缺省 75
 * - 格式：按 Accept 协商 avif → webp → 原格式；svg/gif 原样透传（与 next/image 一致不优化）
 * - 不放大：源图小于请求宽度时按源宽输出（Next 同款行为）
 * - 响应：Cache-Control 与站内 API 一致（public, max-age=60, stale-while-revalidate=300）+
 *   Vary: Accept。源媒体自身的 ?v= immutable 规则不适用于本路由：浏览器缓存键是 /_image
 *   的完整 query（含 v），Next 的 /_next/image 同样只发 SWR 头。
 */

/** 与 next/image 的 imageSizes + deviceSizes 完全一致的合法宽度档位 */
const WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

// 媒体热链的上游域名（inspora 原站 CDN + 布局参考上游仓库的 jsDelivr + Best Designs on X 的媒体镜像）
const UPSTREAM_HOSTS = [
  'media.inspora.design',
  'cdn.jsdelivr.net',
  'cdn.bestdesignsonx.com',
  'cdn.collectui.com',
  'pbs.twimg.com',
];

// 媒体迁到对象存储后（NEXT_PUBLIC_MEDIA_BASE_URL）的额外放行域名；vite define 构建期内联
const MEDIA_BASE_HOST = process.env.NEXT_PUBLIC_MEDIA_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_MEDIA_BASE_URL).hostname
  : null;
/** NEXT_PUBLIC_MEDIA_VERSION（next.config 里由 VERCEL_GIT_COMMIT_SHA/MEDIA_VERSION 注入） */
const MEDIA_VERSION = process.env.NEXT_PUBLIC_MEDIA_VERSION ?? '';

// Vercel：public 整体在 CDN 上，函数文件系统没有本地媒体目录；本地源改走同源回源
// （静态产物经 CDN 提供），本地 Node 部署仍直接读文件系统
const SERVE_STATIC_FROM_CDN = process.env.VERCEL === '1';

// public 目录基准：打包后 chunk 在 .output/server/_ssr（R4，同 vite.config 的构建期补齐方案），
// 源码运行时在 src/routes；用 public/icon.png 作标记文件探测两种布局
const PUBLIC_DIR =
  [
    path.resolve(import.meta.dirname, '../../../public'),
    path.resolve(import.meta.dirname, '../public'),
  ].find((dir) => existsSync(path.join(dir, 'icon.png'))) ??
  path.resolve(import.meta.dirname, '../public');
// 媒体目录的 ?v= 版本参数语义（对应 next.config localPatterns 的 search 条件）
const MEDIA_DIRECTORIES = ['inspora', 'layout-compositions', 'personal-sites'];

const OPTIMIZABLE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/** 明显的本地/私网 host 字面量兜底；白名单只含域名，IP 字面量一律不放行 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
    return true;
  if (host === '::1' || host === '[::1]' || host === '[::]') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.startsWith('fd') || host.startsWith('fe80:')) return true;
  return false;
}

/** 解析并校验 url 参数：返回本地文件路径或远程 URL，不合规返回 null。 */
async function resolveSource(raw: string): Promise<{ local?: string; remote?: URL } | null> {
  if (raw.startsWith('/')) {
    const url = new URL(raw, 'http://local');
    // 本地路径仅允许媒体目录的 v 版本参数；其余 query 一律拒绝，对齐 localPatterns
    for (const key of url.searchParams.keys()) {
      if (key !== 'v') return null;
    }
    if (url.searchParams.has('v')) {
      if (!MEDIA_DIRECTORIES.includes(url.pathname.split('/')[1] ?? '')) return null;
      if (MEDIA_VERSION && url.searchParams.get('v') !== MEDIA_VERSION) return null;
    }
    const filePath = path.resolve(PUBLIC_DIR, `.${url.pathname}`);
    // traversal 防护：解析后必须仍在 public 内；存在性交给读取侧判 404
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return null;
    return { local: filePath };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  const allowed =
    UPSTREAM_HOSTS.includes(host) || (MEDIA_BASE_HOST !== null && host === MEDIA_BASE_HOST);
  if (!allowed || isPrivateHost(host)) return null;
  return { remote: url };
}

/** 上游拉取：不可信内容不落盘、20MB 上限、15s 超时（与站内 fetch 超时档一致） */
async function fetchRemote(
  url: URL,
): Promise<{ ok: true; body: Buffer; contentType: string } | { ok: false }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'personal-design-image-optimizer/1.0' },
    });
    if (!response.ok) return { ok: false };
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > 20_000_000) return { ok: false };
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > 20_000_000) return { ok: false };
    return {
      ok: true,
      body,
      contentType: (response.headers.get('content-type') ?? '').split(';')[0] ?? '',
    };
  } catch {
    return { ok: false };
  }
}

/** 按扩展名推断格式；未知类型返回空串 */
function extensionOf(source: string, fallbackContentType: string): string {
  const byName = path.extname(source).toLowerCase();
  if (CONTENT_TYPES[byName]) return byName;
  const byType = `.${fallbackContentType.split('/')[1] ?? ''}`;
  return CONTENT_TYPES[byType] ? byType : '';
}

/** 按 Accept 协商目标格式；svg/gif 等不优化格式返回 null（原样透传） */
function negotiateFormat(
  accept: string | null,
  sourceExt: string,
): '.avif' | '.webp' | '.jpeg' | '.png' | null {
  if (!OPTIMIZABLE.has(sourceExt)) return null;
  if (accept?.includes('image/avif')) return '.avif';
  if (accept?.includes('image/webp')) return '.webp';
  return sourceExt === '.jpg' || sourceExt === '.jpeg'
    ? '.jpeg'
    : (sourceExt as '.png' | '.webp' | '.avif');
}

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  Vary: 'Accept',
};

/**
 * O4：进程内 LRU 转换缓存。
 * - 键 = 源引用 + w + q + 输出格式维度。输出格式由 Accept 协商决定，因此把原始
 *   Accept 串入键（同一客户端 Accept 稳定，少量变体只是多占几个槽位，不会跨格式
 *   碰撞）；源引用保留原始串（含本地 ?v= 版本参数与远程 host），版本或来源不同
 *   即不同键，天然免失效。
 * - 只缓存 sharp 转换结果：svg/gif 透传与上游回源的原始 Buffer 都不缓存，控制内存；
 *   上游或转换失败不缓存负结果，下次请求照常回源重试。
 * - 选型：媒体与 DB 每部署不可变，无失效需求；Lambda 多实例各自持有进程内缓存即可，
 *   不引入共享存储；条目数与总字节双上限防止大图撑爆实例内存。
 */
const LRU_MAX_ENTRIES = 300;
const LRU_MAX_BYTES = 64 * 1024 * 1024;
const responseCache = new Map<string, { body: Buffer; contentType: string }>();
let responseCacheBytes = 0;

/** 命中并刷新为最近使用（Map 迭代序即插入序，重插实现 LRU 触发） */
function cacheGet(key: string): { body: Buffer; contentType: string } | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  responseCache.delete(key);
  responseCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, entry: { body: Buffer; contentType: string }): void {
  // 单条即超总上限的大图不入缓存
  if (entry.body.byteLength > LRU_MAX_BYTES) return;
  const existing = responseCache.get(key);
  if (existing) {
    responseCacheBytes -= existing.body.byteLength;
    responseCache.delete(key);
  }
  responseCache.set(key, entry);
  responseCacheBytes += entry.body.byteLength;
  while (responseCache.size > LRU_MAX_ENTRIES || responseCacheBytes > LRU_MAX_BYTES) {
    const oldest = responseCache.keys().next();
    if (oldest.done) break;
    const evicted = responseCache.get(oldest.value)!;
    responseCacheBytes -= evicted.body.byteLength;
    responseCache.delete(oldest.value);
  }
}

export const Route = createFileRoute('/_image')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const source = params.get('url');
        if (!source) return new Response('missing url', { status: 400 });
        const width = Number(params.get('w'));
        if (!WIDTHS.includes(width)) return new Response('invalid width', { status: 400 });
        const quality = Number(params.get('q') ?? '75');
        if (!Number.isSafeInteger(quality) || quality < 1 || quality > 100)
          return new Response('invalid quality', { status: 400 });

        // 转换结果缓存命中：直接返回缓存 Buffer（缓存头照发，内容类型随键固化）
        const accept = request.headers.get('accept');
        const cacheKey = `${source}|w=${width}|q=${quality}|accept=${accept ?? ''}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
          return new Response(new Uint8Array(cached.body), {
            headers: { 'Content-Type': cached.contentType, ...CACHE_HEADERS },
          });
        }

        const resolved = await resolveSource(source);
        if (!resolved) return new Response('unsupported source', { status: 400 });

        let input: Buffer;
        let sourceExt: string;
        if (resolved.local) {
          sourceExt = path.extname(resolved.local).toLowerCase();
          if (SERVE_STATIC_FROM_CDN) {
            // CDN 部署：本地原件经同源静态网络回源（去掉 ?v= 版本参数取原件）
            const originUrl = new URL(source, request.url);
            originUrl.search = '';
            const upstream = await fetchRemote(originUrl);
            if (!upstream.ok) return new Response('not found', { status: 404 });
            input = upstream.body;
          } else {
            try {
              input = await readFile(resolved.local);
            } catch {
              return new Response('not found', { status: 404 });
            }
          }
        } else {
          const upstream = await fetchRemote(resolved.remote!);
          if (!upstream.ok) return new Response('upstream failed', { status: 502 });
          input = upstream.body;
          sourceExt = extensionOf(new URL(source).pathname, upstream.contentType);
        }

        const target = negotiateFormat(accept, sourceExt);
        if (!target) {
          // svg/gif 等不优化格式：原字节透传
          return new Response(new Uint8Array(input), {
            headers: {
              'Content-Type': CONTENT_TYPES[sourceExt] ?? 'application/octet-stream',
              ...CACHE_HEADERS,
            },
          });
        }
        try {
          // webp 输入保留动画帧（与 next/image 一致）；其余取首帧
          const body = await sharp(input, { animated: sourceExt === '.webp' })
            .resize({ width, withoutEnlargement: true })
            .toFormat(target.slice(1) as 'avif' | 'webp' | 'jpeg' | 'png', { quality })
            .toBuffer();
          cacheSet(cacheKey, {
            body,
            contentType: CONTENT_TYPES[target] ?? 'application/octet-stream',
          });
          return new Response(new Uint8Array(body), {
            headers: {
              'Content-Type': CONTENT_TYPES[target] ?? 'application/octet-stream',
              ...CACHE_HEADERS,
            },
          });
        } catch (error) {
          // 记录原因便于排查优化管线问题；不向客户端泄漏上游信息
          console.error('[_image] optimization failed:', error);
          return new Response('optimization failed', { status: 500 });
        }
      },
    },
  },
});
