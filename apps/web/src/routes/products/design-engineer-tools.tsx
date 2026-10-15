import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { toolCategories } from '@personal-design/design-engineer-tools';
import { categoryLabel } from '@/lib/category-label';
import { Img } from '@/components/img';
import { pageHead } from '@/lib/site-url';
import styles from './design-engineer-tools.module.css';

export const Route = createFileRoute('/products/design-engineer-tools')({
  head: pageHead('设计工程工具', '按分类整理的设计工程工具目录，可直接打开每项工具。'),
  component: DesignEngineerToolsPage,
});

/** A favicon that fails at runtime falls back to the outgoing-link glyph, like catalog entries without an icon. */
function ToolIcon({ icon }: { icon?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.icon} data-fallback={!icon || failed || undefined} aria-hidden="true">
      {icon && !failed && (
        <Img src={icon} alt="" width={16} height={16} onError={() => setFailed(true)} />
      )}
      <ArrowUpRight size={16} strokeWidth={2} />
    </span>
  );
}

function DesignEngineerToolsPage() {
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
