import { useEffect, useRef, useState } from 'react';
import { Check, Printer } from 'lucide-react';
import { careerReceipt, personalSite } from '@personal-design/personal-sites';
import { useVisiblePlay } from '@/lib/motion';
import { Img } from './img';
import styles from './site-receipt-preview.module.css';

/** Adapted from personal-sites/components/about-print.tsx: same 2.4s stepped paper feed. */
export function SiteReceiptPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageReady, setImageReady] = useState(false);
  const [running, setRunning] = useState(false);
  useVisiblePlay(ref, setRunning);

  // O1 水合竞态兜底：快网下图片的 load 事件可能先于 React 挂上 onLoad 监听器，
  // 仅靠 onLoad 会让 data-ready 永久停留 false。挂载后补查 complete + naturalWidth
  // （naturalWidth>0 排除加载失败：封面被拦截时 complete=true 但解码为 0，
  // 仍保持 false，preview-loops 用例依赖该负向路径）。onLoad/onError 路径保留。
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setImageReady(true);
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
        <Img
          ref={imageRef}
          src={personalSite.cover}
          alt=""
          fill
          sizes="(max-width:640px) 254px, 360px"
          // 小票预览保持原图直连：data-ready 的加载竞态语义以直连封面为前提（勿走 /_image）
          unoptimized
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
