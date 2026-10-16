import type { ComponentProps } from 'react';

/** 与 /_image 路由一致的合法宽度档位（next/image 的 imageSizes + deviceSizes） */
const WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

/** fill srcSet 的设备视口档位（next/image fill 行为的候选宽度推导基准） */
const FILL_DEVICE_WIDTHS = [480, 750, 828, 1080, 1200, 1920];

/** 取不小于目标宽度的最小档位（next/image 固定尺寸 srcSet 的选档规则） */
function nearestWidth(target: number): number {
  return WIDTHS.find((candidate) => candidate >= target) ?? target;
}

function optimizerSrc(src: string, width: number): string {
  return `/_image?url=${encodeURIComponent(src)}&w=${nearestWidth(width)}`;
}

/** sizes 属性的单个来源尺寸项：可选媒体条件 + 长度 */
type SizeEntry = { media: string; length: string };

/**
 * 解析 sizes 为来源尺寸项；长度仅接受 px/vw，媒体条件仅接受
 * (min-width)/(max-width) 子句的 and 组合——现有调用点都在此范围内，
 * 超出范围（calc、em 等）返回 null，调用方放弃 srcSet 保持原图直连。
 */
function parseSizes(sizes: string): SizeEntry[] | null {
  const entries: SizeEntry[] = [];
  for (const raw of sizes.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const split = /^(.*\S)\s+(\S+)$/.exec(part);
    const media = split?.[1] ?? '';
    const length = split?.[2] ?? part;
    if (!/^[\d.]+(?:px|vw)$/.test(length)) return null;
    if (media) {
      const clauses = media.split(/\s+and\s+/);
      const supported = clauses.every(
        (clause) =>
          /^\(\s*min-width:\s*[\d.]+px\s*\)$/.test(clause.trim()) ||
          /^\(\s*max-width:\s*[\d.]+px\s*\)$/.test(clause.trim()),
      );
      if (!supported) return null;
    }
    entries.push({ media, length });
  }
  return entries.length ? entries : null;
}

/** 该视口下 media 条件是否命中（sizes 语义：首个命中的项生效，末项无条件兜底） */
function mediaMatches(media: string, viewport: number): boolean {
  if (!media) return true;
  return media.split(/\s+and\s+/).every((clause) => {
    const min = /\(\s*min-width:\s*([\d.]+)px\s*\)/.exec(clause);
    if (min) return viewport >= Number(min[1]);
    const max = /\(\s*max-width:\s*([\d.]+)px\s*\)/.exec(clause);
    if (max) return viewport <= Number(max[1]);
    return false;
  });
}

/** 渲染宽度：vw 按视口折算，px 直接取值 */
function slotWidthAt(length: string, viewport: number): number {
  return length.endsWith('vw')
    ? (Number.parseFloat(length) / 100) * viewport
    : Number.parseFloat(length);
}

/**
 * fill + sizes 的候选宽度：对每个设备视口取命中的来源尺寸，折算渲染宽度后
 * 吸附到 /_image 合法档位并去重（next/image fill 对 sizes 的推导行为对齐）。
 * sizes 无法解析时返回 null，调用点回退原图直连。
 */
function fillWidthCandidates(sizes: string): number[] | null {
  const entries = parseSizes(sizes);
  if (!entries) return null;
  const widths = new Set<number>();
  for (const viewport of FILL_DEVICE_WIDTHS) {
    const chosen =
      entries.find((entry) => mediaMatches(entry.media, viewport)) ?? entries[entries.length - 1]!;
    widths.add(nearestWidth(slotWidthAt(chosen.length, viewport)));
  }
  return [...widths].sort((a, b) => a - b);
}

type ImgProps = Omit<ComponentProps<'img'>, 'loading' | 'src'> & {
  src: string;
  /**
   * next/image 的 fill 等价：父级需有 position，图片铺满并由相邻 CSS 决定 object-fit
   * （既有 .module.css 均以 `xx img` 选择器控制）。
   */
  fill?: boolean;
  /** 对应 next/image 的 priority：首屏图立即加载，其余默认懒加载 */
  priority?: boolean;
  /** 对应 next/image 的 unoptimized：跳过 /_image，原图直连 */
  unoptimized?: boolean;
};

export function Img({
  src,
  alt,
  fill,
  priority,
  unoptimized,
  width,
  height,
  sizes,
  style,
  ...props
}: ImgProps) {
  // 固定尺寸且未声明 unoptimized 时走 /_image：1x/2x srcSet 对齐 next/image 固定图行为；
  // fill + sizes 同样走 /_image：按设备视口推导候选宽度生成响应式 srcSet（对齐 next/image
  // fill 行为），sizes 原样透传由浏览器自行选档；unoptimized 与无 sizes 的 fill 保持原图直连
  const optimizable =
    !fill && !unoptimized && typeof width === 'number' && typeof height === 'number';
  const fillCandidates = fill && !unoptimized && sizes ? fillWidthCandidates(sizes) : null;
  let srcSet: string | undefined;
  let resolvedSrc = src;
  if (fillCandidates) {
    srcSet = fillCandidates.map((w) => `${optimizerSrc(src, w)} ${w}w`).join(', ');
    resolvedSrc = optimizerSrc(src, fillCandidates[fillCandidates.length - 1]!);
  } else if (optimizable) {
    const one = nearestWidth(width);
    const two = nearestWidth(width * 2);
    if (one !== two) srcSet = `${optimizerSrc(src, one)} 1x, ${optimizerSrc(src, two)} 2x`;
    resolvedSrc = optimizerSrc(src, width);
  }
  return (
    // 本组件即 next/image 的替代实现，原生 img 是刻意的最终产物
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      style={
        fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style
      }
      width={width}
      height={height}
      {...props}
    />
  );
}
