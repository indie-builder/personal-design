import { cdpEvaluate } from './harness.cjs';
// CDP browser check. Failures: static visible tile, motion continuing under
// reduced motion/keyboard/offscreen, failure to resume, or a loop surviving exit.
// Before calling, reveal the Word Arcade tile using the timeline's native buttons.
export async function previewPixels(cdp) {
  return cdpEvaluate(cdp, `new Promise(resolve => {
      const canvas=document.querySelector('a[href="/products/word-arcade"] canvas');
      if(!canvas)throw Error('Word Arcade preview not found');
      const before=canvas.toDataURL();
      setTimeout(()=>resolve({changed:before!==canvas.toDataURL(),playing:canvas.dataset.playing,connected:canvas.isConnected}),1250);
    })`);
}
export async function assertPreviewMotion(cdp, expected) {
  const result=await previewPixels(cdp);
  if(result.changed!==expected)throw Error(`Expected preview motion=${expected}: ${JSON.stringify(result)}`);
  return result;
}
