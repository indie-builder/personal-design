'use client';

import { createProductError } from '@/lib/product-error';

export default createProductError({
  title: '布局参考暂时无法打开',
  href: '/products/layout-compositions',
  returnLabel: '返回布局参考',
});
