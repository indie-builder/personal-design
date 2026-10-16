/**
 * react-syntax-highlighter 样式轻量替身（O2，vite resolve.alias 把
 * `dist/cjs/styles/prism` 与 `dist/cjs/styles/prism/index.js` 两种导入形式指到这里）：
 * 原全量 barrel 会打进几十个主题模块，而 @openuidev/react-ui 实际只用
 * oneLight（浅色）与 vscDarkPlus（深色）。新增使用主题时在此补导出。
 */
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light.js';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus.js';

export { oneLight, vscDarkPlus };
