import { createFileRoute } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { promoPosterUrl, promoUrl, websiteUrl } from '@personal-design/personal-sites';
import { SiteShowcaseMedia } from '@/components/site-showcase-media';
import { buttonClassName } from '@/components/button';
import { createProductError } from '@/lib/product-error';
import { pageHead } from '@/lib/site-url';
import styles from './personal-sites.module.css';

// personal-sites 包只导出纯常量（媒体版本经 vite define 内联），可安全同构引用
export const Route = createFileRoute('/products/personal-sites')({
  head: pageHead('个人网站', '通过网站宣传片，了解陈远的个人工程档案、每日关注与开源收藏。'),
  errorComponent: createProductError({
    title: '个人网站暂时无法打开',
    href: '/products/personal-sites',
    returnLabel: '返回个人网站',
    hint: '加载时遇到了问题，重新加载通常可以恢复。',
  }),
  component: PersonalSitesPage,
});

function PersonalSitesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>一份持续更新的个人工程档案。</p>
        </div>
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClassName({ variant: 'primary' })}
          aria-label="打开个人网站（新标签页）"
        >
          打开网站
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </header>
      <p className={styles.description}>
        在这里记录工程经历，也整理每天读到的动态、值得回看的内容和持续关注的开源项目。从一条摘要进入完整阅读，再回到原始来源。
      </p>
      <SiteShowcaseMedia videoSrc={promoUrl} poster={promoPosterUrl} />
    </main>
  );
}
