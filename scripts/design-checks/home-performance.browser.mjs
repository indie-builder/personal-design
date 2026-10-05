// Use a production homepage and a compatible CDP session.
// These checks only exercise scrolling/rendering; they do not mutate game state.
import { cdpEvaluate } from './harness.cjs';
const evaluate = (cdp, expression) => cdpEvaluate(cdp, expression, { timeoutMs: 10000 });
export async function verifyTimelineBounds(cdp) {
  const result = await evaluate(
    cdp,
    `(async()=>{
    const track=document.getElementById('home-timeline'),results=[];
    for(const left of [0,500,track.scrollWidth]){
      track.scrollTo({left,behavior:'instant'});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const max=track.scrollWidth-track.clientWidth,x=track.scrollLeft;
      results.push({x,max,previous:document.querySelector('[data-direction=previous]').disabled,next:document.querySelector('[data-direction=next]').disabled});
    }
    return results;
  })()`,
  );
  for (const s of result)
    if (s.previous !== s.x < 2 || s.next !== s.x >= s.max - 2) throw Error(JSON.stringify(s));
  return result;
}
export async function verifyDictionaryReuse(cdp) {
  const result = await evaluate(
    cdp,
    `(async()=>{
    const link=document.querySelector('a[href="/products/ai-coding-dictionary"]'),track=document.getElementById('home-timeline'),first=link.querySelector('iframe');
    if(!first?.contentWindow.__atlasRenderPolicy)throw Error('Reveal the ready dictionary preview before running this check');
    track.scrollTo({left:0,behavior:'instant'});await new Promise(r=>setTimeout(r,200));
    const paused=first.isConnected&&first.style.visibility==='hidden'&&first.contentWindow.__atlasRenderPolicy.getSnapshot()==='never';
    link.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});await new Promise(r=>setTimeout(r,200));
    const resumed=link.querySelector('iframe')===first&&first.style.visibility==='visible'&&first.contentWindow.__atlasRenderPolicy.getSnapshot()==='always';
    track.scrollTo({left:0,behavior:'instant'});await new Promise(r=>setTimeout(r,1800));
    return {paused,resumed,released:!first.isConnected};
  })()`,
  );
  if (!result.paused || !result.resumed || !result.released) throw Error(JSON.stringify(result));
  return result;
}

export async function verifyPreviewPixels(cdp) {
  const result = await evaluate(cdp, 'JSON.parse(document.getElementById("result").textContent)');
  if (!result.pass || result.cases !== 144 || result.max !== 0) throw Error(JSON.stringify(result));
  return result;
}
