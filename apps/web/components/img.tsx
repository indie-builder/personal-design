import type { ComponentProps } from 'react';

type ImgProps = Omit<ComponentProps<'img'>, 'loading' | 'src'> & {
  src: string;
  /**
   * next/image 的 fill 等价：父级需有 position，图片铺满并由相邻 CSS 决定 object-fit
   * （既有 .module.css 均以 `xx img` 选择器控制）。
   */
  fill?: boolean;
  /** 对应 next/image 的 priority：首屏图立即加载，其余默认懒加载 */
  priority?: boolean;
};

/**
 * next/image 的轻量替代：原生 <img> 透传，不接优化器（迁移下一段再做 /_image）。
 * 保持原调用点的视觉语义：尺寸、sizes、加载优先级与失败回调原样生效。
 */
export function Img({ src, alt, fill, priority, style, ...props }: ImgProps) {
  return (
    // 本组件即 next/image 的替代实现，原生 img 是刻意的最终产物
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      style={
        fill
          ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }
          : style
      }
      {...props}
    />
  );
}
