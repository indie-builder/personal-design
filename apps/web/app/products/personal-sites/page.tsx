import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { websiteUrl, promoUrl, promoPosterUrl } from '@personal-design/personal-sites';
import { buttonClassName } from '@/components/button';
import { SiteShowcaseMedia } from '@/components/site-showcase-media';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: '个人网站',
  description: '通过网站宣传片，了解陈远的个人工程档案、每日关注与开源收藏。',
};

export default function PersonalSitesPage() {
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
