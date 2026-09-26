'use client';

import { useCallback, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { instantMotion, useVisiblePlay } from '@/lib/motion';
import styles from './ai-chat-preview.module.css';

export function AiChatPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const onPlay = useCallback((playing: boolean) => {
    setEnabled(!instantMotion());
    setRunning(playing);
  }, []);
  useVisiblePlay(ref, onPlay, 0.35);
  return (
    <div
      ref={ref}
      className={styles.surface}
      data-chat-preview
      data-motion={enabled || undefined}
      data-running={running || undefined}
      aria-hidden="true"
    >
      <span className={styles.question}>看看两周试用的效果</span>
      <div className={styles.reply}>
        <div className={styles.thinking}>
          <i />
          <i />
          <i />
        </div>
        <div className={styles.answer}>
          <div className={styles.heading}>
            <strong>任务完成率</strong>
            <small>试用样本</small>
          </div>
          <div className={styles.chart}>
            <div>
              <span>对照</span>
              <i>
                <b className={styles.before} />
              </i>
              <em>60%</em>
            </div>
            <div>
              <span>试用</span>
              <i>
                <b className={styles.after} />
              </i>
              <em>90%</em>
            </div>
          </div>
          <span className={styles.followUp}>
            看看改进建议
            <ArrowUpRight size={12} strokeWidth={1.6} />
          </span>
        </div>
      </div>
    </div>
  );
}
