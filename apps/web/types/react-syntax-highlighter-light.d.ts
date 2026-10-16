/**
 * react-syntax-highlighter 未随包提供类型声明（官方类型在独立 @types 包）。
 * 本仓只经 vite alias 指入的轻量替身深路径使用它的 dist 文件（见
 * lib/syntax-highlighter.light.ts），运行时形状按各文件默认导出对齐，
 * 这里以通配模块声明按 any 放行，避免为替身引入整个 @types 包。
 */
declare module 'react-syntax-highlighter/*' {
  const syntaxHighlighterModule: any;
  export default syntaxHighlighterModule;
  export const PrismLight: any;
}
