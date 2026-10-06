import type { Metadata } from 'next';
import { toolCategories } from '@personal-design/design-engineer-tools';
import { categoryLabel } from '@/lib/category-label';
import { ToolIcon } from './tool-icon';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: '设计工程工具',
  description: '按分类整理的设计工程工具目录，可直接打开每项工具。',
};

export default function DesignEngineerToolsPage() {
  return (
    <main className={styles.page}>
      <section aria-label="设计工程工具目录">
        <div className={styles.groups}>
          {toolCategories.map((category, index) => (
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
                      <ToolIcon icon={tool.icon} />
                      <span>{tool.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
