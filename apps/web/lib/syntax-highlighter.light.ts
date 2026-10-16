/**
 * react-syntax-highlighter 轻量替身（O2，vite resolve.alias 把根入口指到这里）：
 * @openuidev/react-ui 的 CodeBlock 以 `import { Prism } from 'react-syntax-highlighter'`
 * 拿全语言 Prism 构建（内部 `refractor/all`，数百种语言），是 ai-chat 路由 chunk
 * 600KB gzip 的主因。这里换成 prism-light 空内核，按 refractor/all 的规范顺序注册
 * 聊天答案实际出现的语言及其语法基座与增强语言（css-extras 的选择器 class/id、
 * js-extras 的 control-flow 关键词与 property-access 都由增强语言补齐，漏注册会
 * 与全量构建的高亮分类不一致）；未注册语言在 highlight 工厂里按纯文本渲染
 * （try/catch 回退，不抛错）。视觉样式仍由 react-ui 传入的 oneLight / vscDarkPlus
 * 决定，配色不变。新增语言时按同序在此补 registerLanguage / alias。
 */
import PrismLight from 'react-syntax-highlighter/dist/esm/prism-light.js';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash.js';
import clike from 'react-syntax-highlighter/dist/esm/languages/prism/clike.js';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css.js';
import cssExtras from 'react-syntax-highlighter/dist/esm/languages/prism/css-extras.js';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript.js';
import jsExtras from 'react-syntax-highlighter/dist/esm/languages/prism/js-extras.js';
import jsTemplates from 'react-syntax-highlighter/dist/esm/languages/prism/js-templates.js';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json.js';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx.js';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup.js';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python.js';
import regex from 'react-syntax-highlighter/dist/esm/languages/prism/regex.js';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx.js';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript.js';

// registerLanguage 的名称参数被 prism-light 忽略（按 refractor 语言的 displayName 注册，
// 依赖语言由 refractor 语法函数自带注册）。注册顺序对齐 refractor/all：基座语言
// （markup/css/clike/regex）先于派生语言，增强语言（css-extras/js-extras/js-templates）
// 紧随其目标语法、先于从该语法 extend 出的 jsx/tsx——extend 是拷贝，后补的增强
// 不会传播。fence 常见短别名经 alias 指向同一语言。
PrismLight.registerLanguage('markup', markup);
PrismLight.alias('markup', ['html', 'xml', 'svg']);
PrismLight.registerLanguage('css', css);
PrismLight.registerLanguage('css-extras', cssExtras);
PrismLight.registerLanguage('clike', clike);
PrismLight.registerLanguage('regex', regex);
PrismLight.registerLanguage('javascript', javascript);
PrismLight.alias('javascript', ['js', 'mjs', 'node']);
PrismLight.registerLanguage('js-extras', jsExtras);
PrismLight.registerLanguage('js-templates', jsTemplates);
PrismLight.registerLanguage('json', json);
PrismLight.registerLanguage('jsx', jsx);
PrismLight.registerLanguage('python', python);
PrismLight.alias('python', ['py']);
PrismLight.registerLanguage('tsx', tsx);
PrismLight.registerLanguage('typescript', typescript);
PrismLight.alias('typescript', ['ts']);
PrismLight.registerLanguage('bash', bash);
PrismLight.alias('bash', ['sh', 'shell', 'zsh']);

export const Prism = PrismLight;
export default PrismLight;
