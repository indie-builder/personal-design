/// <reference types="vite/client" />

// 移除 next-env.d.ts 后，Next 原生的样式模块声明不再可用；这里补齐最小声明。
// app/ 目录清理前，其中遗留页面仍会被 typecheck 扫到。
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.css';
