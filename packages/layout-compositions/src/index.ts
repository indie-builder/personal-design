import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import rawCatalog from '../catalog.json';
import rawCorrections from '../corrections.json';

/** 上游 catalog.json 的单条记录（字段与上游保持一致，不要改动语义）。 */
export interface LayoutItem {
  /** 全局编号，"001"–"350" */
  id: string;
  /** 中文名称，如「三分法构图」 */
  name: string;
  /** 一级分类中文名，如「构图逻辑」 */
  category: string;
  /** 一级分类稳定标识，如 "01-composition-logic" */
  category_slug: string;
  /** 二级分类中文名 */
  subcategory: string;
  /** 二级分类稳定标识 */
  subcategory_slug: string;
  /** 上游仓库内高清图路径（本仓库不直接使用，见 imageUrl） */
  image: string;
  /** 上游仓库内缩略图路径（本仓库不直接使用，见 thumbnailUrl） */
  thumbnail: string;
  width: number;
  height: number;
  sha256: string;
}

export interface Category {
  slug: string;
  name: string;
  count: number;
  subcategories: Subcategory[];
}

export interface Subcategory {
  slug: string;
  name: string;
  count: number;
}

/** 全部 350 条排版记录，顺序与上游一致（按 id 升序）。 */
export const catalog = rawCatalog as LayoutItem[];

function buildCategories(items: LayoutItem[]): Category[] {
  const categories: Category[] = [];
  const bySlug = new Map<string, Category>();
  const subBySlug = new Map<string, Subcategory>();

  for (const item of items) {
    let category = bySlug.get(item.category_slug);
    if (!category) {
      category = {
        slug: item.category_slug,
        name: item.category,
        count: 0,
        subcategories: [],
      };
      bySlug.set(item.category_slug, category);
      categories.push(category);
    }
    category.count += 1;

    const subKey = `${item.category_slug}/${item.subcategory_slug}`;
    let subcategory = subBySlug.get(subKey);
    if (!subcategory) {
      subcategory = {
        slug: item.subcategory_slug,
        name: item.subcategory,
        count: 0,
      };
      subBySlug.set(subKey, subcategory);
      category.subcategories.push(subcategory);
    }
    subcategory.count += 1;
  }
  return categories;
}

/** 8 个一级分类（含二级分类与条目数），按上游顺序。 */
export const categories = buildCategories(catalog);

const byId = new Map(catalog.map((item) => [item.id, item]));

export function getLayoutById(id: string): LayoutItem | undefined {
  return byId.get(id);
}

/** 媒体 base：缺省为空（本地 public 路径）；设 NEXT_PUBLIC_MEDIA_BASE_URL（对象存储公开域名）后返回绝对 URL */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/+$/, '');
const MEDIA_VERSION = process.env.NEXT_PUBLIC_MEDIA_VERSION;

/** 上游仓库的 jsDelivr CDN（热链原图用，免自建存储） */
const UPSTREAM_CDN = 'https://cdn.jsdelivr.net/gh/nevertoday/350-layout-compositions@main/';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public');

type Corrections = Record<string, { v2?: string; v1?: string; missing?: boolean }>;
const corrections = rawCorrections as Corrections;

/**
 * 解析条目实际的上游图源文件（与 sync 脚本同一套 corrections 逻辑）：
 * - 默认：条目自身 image 字段
 * - { v2 }：v2 里的另一个文件（上游图文错位，以 corrections 为准）
 * - { v1 }：旧版 100 种排版里的等价图（v2 丢失，v1 补齐）
 * - { missing }：上游不存在
 */
function resolveUpstreamImage(item: LayoutItem): string | null {
  const correction = corrections[item.id];
  if (!correction) return item.image;
  if (correction.missing) return null;
  if (correction.v1) return `images/layout-${correction.v1}.png`;
  const source = byId.get(correction.v2!);
  if (!source) return null;
  return source.image;
}

/**
 * 高清图地址：本地无损 WebP 存在时用本地（sync 脚本生成），
 * 否则热链上游 jsDelivr CDN 的 PNG 原图。
 */
export function imageUrl(item: LayoutItem): string {
  const local = `/layout-compositions/images/${item.category_slug}/${item.id}.webp`;
  if (existsSync(join(PUBLIC_DIR, local))) {
    return `${MEDIA_BASE}${local}${MEDIA_VERSION ? `?v=${MEDIA_VERSION}` : ''}`;
  }
  const upstreamPath = resolveUpstreamImage(item);
  return upstreamPath ? UPSTREAM_CDN + encodeURI(upstreamPath) : '';
}

/** 站点内缩略图 WebP 路径（本地常驻，体积小）。 */
export function thumbnailUrl(item: LayoutItem): string {
  return `${MEDIA_BASE}/layout-compositions/thumbnails/${item.category_slug}/${item.id}.webp${MEDIA_VERSION ? `?v=${MEDIA_VERSION}` : ''}`;
}

/** 上游图片缺失的条目 id（v2 丢失且 v1 无等价图）。 */
export const missingImageIds: ReadonlySet<string> = new Set(
  Object.entries(corrections)
    .filter(([, correction]) => correction.missing)
    .map(([id]) => id),
);

/** 该条目是否有可展示的图片（上游缺失时为 false，站点应渲染占位）。 */
export function hasImage(item: LayoutItem): boolean {
  return !missingImageIds.has(item.id);
}

/** 按一级分类取条目，保持 id 顺序。 */
export function itemsByCategory(categorySlug: string): LayoutItem[] {
  return catalog.filter((item) => item.category_slug === categorySlug);
}

/** 按二级分类取条目，保持 id 顺序。 */
export function itemsBySubcategory(categorySlug: string, subcategorySlug: string): LayoutItem[] {
  return catalog.filter(
    (item) => item.category_slug === categorySlug && item.subcategory_slug === subcategorySlug,
  );
}

/** 上游项目信息（CC BY 4.0 署名用），实现见 upstream.ts（客户端安全模块）。 */
export { upstream } from './upstream';
