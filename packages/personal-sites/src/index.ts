const mediaVersion = process.env.NEXT_PUBLIC_MEDIA_VERSION;
const localMedia = (path: string) => `${path}${mediaVersion ? `?v=${mediaVersion}` : ''}`;

/** 独立部署的个人网站；仅保存作品入口与公开预览。 */
export const personalSite = {
  slug: 'personal-sites',
  name: '个人网站',
  tagline: '工程记录、每日关注与开源收藏',
  description: '陈远的个人工程档案，记录工程经历、每日动态、内容收藏与开源关注。',
  date: '2026-09-09',
  href: '/products/personal-sites',
  cover: localMedia('/personal-sites/home.webp'),
  stats: [],
  line: 'sites' as const,
};

export const timelineAvatarUrl = localMedia('/personal-sites/profile-avatar.webp');

export const websiteUrl = 'https://default-coder.lovemyrmb.cn/';
export const promoUrl = localMedia('/personal-sites/promo.mp4');
export const promoPosterUrl = localMedia('/personal-sites/promo-poster.webp');

/** Frozen from the original AboutPrint career receipt (2026-09-09). */
export const careerReceipt = [
  { company: 'PLUS数字科技', years: '5 年' },
  { company: '红星美凯龙', years: '4 年' },
  { company: '喜马拉雅', years: '3 年' },
  { company: 'PayerMax', years: '至今' },
];
