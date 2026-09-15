const labels: Record<string, string> = {
  构图逻辑: '构图',
  视觉原则与阅读模式: '视觉原则',
  '平面、出版与广告': '平面与出版',
  '字体、网格与东亚文字': '字体与网格',
  '网页与 UI': '网页与 UI',
  影视画面构图: '影视构图',
  中国传统构图: '传统构图',
  演示文稿页面: '演示文稿',
  Motion: '动效',
  Product: '产品设计',
  Web: '网页',
  Illustration: '插画',
  Branding: '品牌',
  Print: '平面',
  '3D': '三维',
};
export const categoryLabel = (name: string) => labels[name] ?? name;
