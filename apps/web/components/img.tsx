import type { ComponentProps } from 'react';

/** 与 /_image 路由一致的合法宽度档位（next/image 的 imageSizes + deviceSizes） */
const WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

/** 取不小于目标宽度的最小档位（next/image 固定尺寸 srcSet 的选档规则） */
function nearestWidth(target: number): number {
  return WIDTHS.find((candidate) => candidate >= target) ?? target;
}

function optimizerSrc(src: string, width: number): string {
  return `/_image?url=${encodeURIComponent(src)}&w=${nearestWidth(width)}`;
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
  style,
  ...props
}: ImgProps) {
  // 固定尺寸且未声明 unoptimized 时走 /_image：1x/2x srcSet 对齐 next/image 固定图行为；
  // fill（渲染尺寸未知）与 unoptimized 调用点保持原图直连
  const optimizable = !fill && !unoptimized && typeof width === 'number' && typeof height === 'number';
  let srcSet: string | undefined;
  if (optimizable) {
    const one = nearestWidth(width);
    const two = nearestWidth(width * 2);
    if (one !== two) srcSet = `${optimizerSrc(src, one)} 1x, ${optimizerSrc(src, two)} 2x`;
  }
  return (
    // 本组件即 next/image 的替代实现，原生 img 是刻意的最终产物
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={optimizable ? optimizerSrc(src, width) : src}
      srcSet={srcSet}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      style={
        fill
          ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }
          : style
      }
      width={width}
      height={height}
      {...props}
    />
  );
}
