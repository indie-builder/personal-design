import type { Metadata } from 'next';
import { toolCategories } from '@personal-design/design-engineer-tools';
import { ToolsDirectory } from '@/components/tools-directory';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: '设计工程工具',
  description: '按分类整理的设计工程工具目录，可直接打开每项工具。',
};

export default function DesignEngineerToolsPage() {
  return (
    <main className={styles.page}>
      <ToolsDirectory categories={toolCategories} />
    </main>
  );
}
