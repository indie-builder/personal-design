'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import styles from './page.module.css';

/** A favicon that fails at runtime falls back to the outgoing-link glyph, like catalog entries without an icon. */
export function ToolIcon({ icon }: { icon?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.icon} data-fallback={!icon || failed || undefined} aria-hidden="true">
      {icon && !failed && (
        <Image src={icon} alt="" width={16} height={16} onError={() => setFailed(true)} />
      )}
      <ArrowUpRight size={16} strokeWidth={2} />
    </span>
  );
}
