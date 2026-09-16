import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import { categoryLabel } from '@/lib/category-label';
import styles from './tools-directory.module.css';

export type DirectoryCategory = {
  id: string;
  tools: { name: string; url: string; icon: string | null }[];
};

export function ToolsDirectory({ categories }: { categories: DirectoryCategory[] }) {
  return (
    <section aria-label="设计工程工具目录">
      <div className={styles.groups}>
        {categories.map((category, index) => (
          <section
            key={category.id}
            className={styles.group}
            data-wide={index === 0 || undefined}
            aria-labelledby={`tools-${category.id}`}
          >
            <h2 id={`tools-${category.id}`}>{categoryLabel(category.id)}</h2>
            <ul>
              {category.tools.map((tool) => (
                <li key={tool.url}>
                  <a href={tool.url} target="_blank" rel="noopener noreferrer">
                    <span
                      className={styles.icon}
                      data-fallback={!tool.icon || undefined}
                      aria-hidden="true"
                    >
                      {tool.icon && <Image src={tool.icon} alt="" width={16} height={16} />}
                      <ArrowUpRight size={16} strokeWidth={2} />
                    </span>
                    <span>{tool.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
