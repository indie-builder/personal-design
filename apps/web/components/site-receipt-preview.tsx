'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Check, Printer } from 'lucide-react';
import { careerReceipt, personalSite } from '@personal-design/personal-sites';
import styles from './site-receipt-preview.module.css';

/** Adapted from personal-sites/components/about-print.tsx: same 2.4s stepped paper feed. */
export function SiteReceiptPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [imageReady, setImageReady] = useState(false);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const update = () => setRunning(visible && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting && entry.intersectionRatio >= 0.3;
        update();
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={styles.preview}
      data-running={running}
      data-ready={imageReady}
      aria-hidden="true"
    >
      <div className={styles.homepage}>
        <Image
          src={personalSite.cover}
          alt=""
          fill
          sizes="(max-width:640px) 254px, 360px"
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(false)}
        />
      </div>
      <div className={styles.printer}>
        <div className={styles.machine}>
          <div className={styles.screen}>
            <span className={styles.printing}>
              <Printer size={11} />
              正在打印个人经历…
            </span>
            <span className={styles.done}>
              <Check size={11} />
              打印完成 · 请取走小票
            </span>
          </div>
          <div className={styles.slot} />
        </div>
        <div className={styles.output}>
          <div className={styles.paper}>
            <div className={styles.name}>陈远 / CHEN YUAN</div>
            <div className={styles.subtitle}>个人经历 · CAREER RECEIPT</div>
            <div className={styles.items}>
              {careerReceipt.map((item) => (
                <div key={item.company} className={styles.item}>
                  <span>{item.company}</span>
                  <span>{item.years}</span>
                </div>
              ))}
            </div>
            <div className={styles.total}>
              <span>合计 TOTAL</span>
              <strong>12 年</strong>
            </div>
            <div className={styles.barcode} />
          </div>
        </div>
      </div>
    </div>
  );
}
