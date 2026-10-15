import { copyFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import { defineConfig, type Plugin } from 'vite';

// Next.js 会把 NEXT_PUBLIC_* 在构建期内联进客户端代码；Vite 用 define 达成同一语义，
// 让 @personal-design/personal-sites、@personal-design/inspora、lib/site-url.ts 的
// 模块级 process.env.NEXT_PUBLIC_* 读取在客户端 bundle 里安全求值。
const publicEnvKeys = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_MEDIA_BASE_URL',
  'NEXT_PUBLIC_MEDIA_VERSION',
] as const;
const define = Object.fromEntries(
  publicEnvKeys.map((key) => [`process.env.${key}`, JSON.stringify(process.env[key] ?? '')]),
);

/**
 * 打包后 inspora / layout-compositions 以 .output/server/_ssr 内的 chunk 为基准解析
 * inspora.db 与 public 媒体目录（源码里是 import.meta.url 相对定位）， Nitro 的依赖追踪
 * 覆盖不到这类动态拼接路径。构建后按同一相对布局补齐产物，保证「本地媒体优先」语义
 * 不回退成上游热链（对应迁移报告 R4 的构建期拷贝方案）。
 */
function serverDataAssets(): Plugin {
  return {
    name: 'personal-design:server-data-assets',
    apply: 'build',
    closeBundle() {
      const ssrDir = resolve(import.meta.dirname, '.output/server/_ssr');
      if (!existsSync(ssrDir)) return;
      const dbSource = resolve(import.meta.dirname, '../../packages/inspora/inspora.db');
      if (existsSync(dbSource)) {
        copyFileSync(dbSource, resolve(ssrDir, '../inspora.db'));
      }
      // nf3 追踪的 sharp 副本缺 dist 入口，会遮蔽 apps/web 内的完整安装；SSR chunk 对
      // sharp 是外部导入，删掉副本后 Node 沿 .output → apps/web/node_modules 找到真身
      rmSync(resolve(import.meta.dirname, '.output/server/node_modules/sharp'), {
        recursive: true,
        force: true,
      });
      // chunk 深度比源码包深一层：PUBLIC_DIR 解析到 apps/web/apps/web/public，补软链指回
      // 真实 public（apps/web/apps/ 已加入 .gitignore）
      const fakePublicDir = resolve(import.meta.dirname, 'apps/web');
      mkdirSync(fakePublicDir, { recursive: true });
      const link = resolve(fakePublicDir, 'public');
      rmSync(link, { force: true });
      symlinkSync('../../public', link, 'dir');
    },
  };
}

export default defineConfig({
  plugins: [
    // tanstackStart 必须在 viteReact 之前（官方要求）
    tanstackStart(),
    // 本版 Start 已把部署目标从核心拆出：Node 输出（.output/server/index.mjs）按官方
    // hosting 文档经 nitro/vite 插件接入，pnpm start 依赖该产物
    nitro({
      // nitro 环境构建（server routes/services）会用自身 aliases 覆盖 vite 的 resolve.alias，
      // 这里同步声明 '@' 才能在 server route 里继续用与页面一致的导入写法
      alias: { '@': resolve(import.meta.dirname) },
      // 路径型响应头（对静态文件与动态渲染同等生效）；query 条件的媒体 immutable
      // 规则表达不了，由下方 modules 注册的运行时插件处理
      routeRules: {
        // 全站安全基线；值与原 next.config.ts 逐字节一致
        '/**': {
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-Frame-Options': 'DENY',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
          },
        },
        // AI Coding 词典的静态运行资源允许被站点自身 iframe 引用
        '/ai-coding-atlas/**': {
          headers: {
            'X-Frame-Options': 'SAMEORIGIN',
            'Content-Security-Policy': "frame-ancestors 'self'",
          },
        },
      },
      // pi-coding-agent 运行时会 createRequire 解析 quickjs-wasm 等资产且自带依赖树，
      // 保持 server 外置（对应 next.config 的 serverExternalPackages），由 nf3 追踪进产物。
      // sharp 保持默认外置导入；其 nf3 追踪副本不完整（缺 dist 入口），由
      // serverDataAssets 在构建后删除该副本，运行时沿目录树解析 apps/web 内的完整安装
      traceDeps: ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai'],
      modules: [
        {
          name: 'personal-design:media-version-headers',
          setup(nitro) {
            // 运行时插件负责静态媒体响应的 ?v= 缓存头（见 nitro/plugins/）
            nitro.options.plugins.unshift(
              resolve(import.meta.dirname, 'nitro/plugins/media-version-headers'),
            );
          },
        },
      ],
    }),
    // React Compiler 对应 next.config 的 reactCompiler: true；
    // plugin-react 6 已移除 babel 选项，改用内置 compiler 开关（oxc 实现）
    viteReact({ compiler: true }),
    tailwindcss(),
    serverDataAssets(),
  ],
  resolve: {
    // tsconfig paths 的 '@/*' 映射（本版 TanStack 插件无 tsconfigPaths 选项，用 alias 等价实现）
    alias: { '@': resolve(import.meta.dirname) },
  },
  define,
  server: {
    // portless 通过 PORT 透传实际端口；host 开放给 .localhost 域名代理
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
    allowedHosts: ['personal-design.localhost', '.personal-design.localhost'],
  },
});
