import React from 'react';
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { PageCam } from './lib/PageCam';
import layout from '../public/textures/layout.json';

export const SHOTS = {
  brand: { from: 0, duration: 120 },
  news: { from: 120, duration: 180 },
  collections: { from: 300, duration: 240 },
  lead: { from: 540, duration: 120 },
  reading: { from: 660, duration: 240 },
  outro: { from: 900, duration: 180 },
};
export const TOTAL = 1080;
const INK = '#1c1c1e';
const SOFT = '#6f6f72';
const FONT = 'system-ui, -apple-system, "PingFang SC", sans-serif';
const ease = Easing.bezier(0.33, 0, 0.15, 1);
const p = (f: number, a: number, b: number, easing = ease) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
const texture = (name: string) => staticFile(`textures/${name}.png`);
const surface: React.CSSProperties = { background: '#fff', fontFamily: FONT, color: INK, letterSpacing: 0 };

function Corner({ text, n }: { text: string; n: string }) {
  return <div style={{ position: 'absolute', left: 96, right: 96, top: 64, display: 'flex', justifyContent: 'space-between', fontSize: 34, color: SOFT }}><span>{text}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{n} / 05</span></div>;
}

function Brand() {
  const f = useCurrentFrame();
  const out = p(f, 113, 120, Easing.bezier(0.4, 0, 0.5, 1));
  // brand-ink-open: crosshair, letterpress, typed kicker, >=30f stable lockup.
  return <AbsoluteFill style={surface}>
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - out, transform: `translateY(${-40*out}px) scale(${1-.12*out})` }}>
      <div style={{ position: 'absolute', left: 960-350, top: 90, width: 700, height: 194, overflow: 'hidden', opacity: .52, maskImage: 'linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent)' }}>
        <Img src={texture('news-cut-5')} style={{ width: 706, height: 194, transform: `translateX(${28*(1-p(f,0,90))}px)` }}/>
      </div>
      <div style={{position:'absolute',left:480,top:186,width:960,background:'#fff',padding:'12px 0',display:'flex',justifyContent:'center',gap:52,fontFamily:'ui-monospace, Menlo, monospace',fontSize:40,opacity:p(f,24,44)}}><span>Java</span><span>TypeScript</span><span>Python</span></div>
      <Img src={texture('curation-cut-0')} style={{ position: 'absolute', left: 840, top: 302, width: 240, height: 240, borderRadius: 18, opacity: p(f, 10, 32), transform: `translateY(${20*(1-p(f,10,32))}px)` }}/>
      <svg width="80" height="80" viewBox="0 0 80 80" style={{ position:'absolute',left:920,top:380,opacity:1-p(f,24,34) }}>
        <line x1="40" y1="5" x2="40" y2="75" stroke={INK} strokeWidth="3" pathLength="100" strokeDasharray="100" strokeDashoffset={100*(1-p(f,0,9))}/>
        <line x1="5" y1="40" x2="75" y2="40" stroke={INK} strokeWidth="3" pathLength="100" strokeDasharray="100" strokeDashoffset={100*(1-p(f,8,18))}/>
      </svg>
      <div style={{ position:'absolute',top:570,width:'100%',textAlign:'center',fontSize:128,fontWeight:600,lineHeight:1.35 }}>
        {'陈远'.split('').map((c,i)=>{const t=p(f,10+i*3,22+i*3,Easing.bezier(.2,.7,.25,1));return <span key={c} style={{display:'inline-block',opacity:t,transform:`scale(${1.6-.6*t})`,transformOrigin:'center bottom',filter:`blur(${6*(1-t)}px)`}}>{c}</span>;})}
      </div>
      <div style={{position:'absolute',top:786,width:'100%',textAlign:'center',fontSize:44,color:SOFT}}>{'个人工程档案'.slice(0,Math.floor(Math.max(0,f-34)/3))}</div>
    </div>
  </AbsoluteFill>;
}

function News() {
  const f = useCurrentFrame();
  const rows = layout.news.items.slice(0,3);
  return <AbsoluteFill style={surface}>
    <div style={{position:'absolute',inset:0,clipPath:'inset(178px 80px 250px 585px)'}}>
      <PageCam src="textures/news-full.png" pageH={layout.news.pageH} keys={[{frame:0,cx:1050,cy:350,zoom:1.3},{frame:115,cx:1050,cy:369,zoom:1.3},{frame:180,cx:1050,cy:369,zoom:1.3}]}>
        {rows.map((r,i)=>{
          const cue=12+i*9,land=cue+12,t=p(f,cue,land,Easing.bezier(.3,0,.25,1)),air=1-t;
          const patch=1-p(f,land,land+2,Easing.linear);
          const scale=f<land?1.06-.065*t:.995+.005*p(f,land,land+4,Easing.out(Easing.quad));
          return <React.Fragment key={i}>
            {patch>0&&<div style={{position:'absolute',left:r.x-2,top:r.y-1,width:r.w+4,height:r.h+2,background:'#fff',opacity:patch}}/>}
            {f>=cue&&f<cue+16&&<div style={{position:'absolute',left:r.x,top:r.y,width:r.w,height:r.h,overflow:'hidden',opacity:p(f,cue,cue+3,Easing.linear),transform:`perspective(900px) translateY(${-120*air}px) rotateX(${16*air}deg) scale(${scale})`,boxShadow:`0 ${30*air}px ${60*air}px rgba(0,0,0,${.16*air})`}}><Img src={texture(`news-cut-${i}`)} style={{width:'100%',height:'100%'}}/></div>}
            {f>=land&&f<land+8&&<div style={{position:'absolute',left:r.x,top:r.y+r.h-2,width:r.w,height:2,overflow:'hidden'}}><div style={{height:2,background:INK,transform:`scaleX(${p(f,land,land+5,Easing.out(Easing.cubic))})`,opacity:1-p(f,land+2,land+8,Easing.linear)}}/></div>}
          </React.Fragment>;
        })}
      </PageCam>
    </div>
    <Corner text="动态 · 持续阅读" n="01"/>
    <div style={{position:'absolute',left:96,top:314,width:470}}>
      <div style={{width:56,height:3,background:INK,marginBottom:36}}/>
      <h2 style={{fontSize:80,fontWeight:550,lineHeight:1.35,margin:0}}>每日动态</h2>
      <p style={{fontSize:42,lineHeight:1.65,color:SOFT,marginTop:30}}>把每天的变化，<br/>整理成可读的线索。</p>
    </div>
    <div style={{position:'absolute',left:640,right:100,bottom:132,height:1,background:'#ddd'}}/>
  </AbsoluteFill>;
}

function Collections() {
  const f = useCurrentFrame();
  // word-relay-filmstrip: fixed 530px cards, only step during 16f word switch.
  const sw=112,progress=p(f,sw,sw+16,Easing.bezier(.65,0,.35,1)),step=635;
  const opOld=1-p(f,sw,sw+7,Easing.linear),opNew=p(f,sw+8,sw+16,Easing.linear);
  const cards=['curation','design','curation'];
  return <AbsoluteFill style={{...surface,background:'#f6f6f6'}}>
    {cards.map((name,i)=><div key={i} style={{position:'absolute',left:96,top:275+i*step-progress*step,width:1000,height:530,overflow:'hidden',borderRadius:8,background:i%2?'#1c1c1e':'white',border:i%2?'10px solid #1c1c1e':'1px solid #ddd',boxShadow:'0 16px 50px #00000012'}}>
      {/* A real content-region crop; inset width keeps the original UI typography intact. */}
      <Img src={texture(name)} style={{position:'absolute',width:2304,height:1296,left:-944,top:-32}}/>
    </div>)}
    <div style={{position:'absolute',left:1200,top:365,width:620,height:350}}>
      <div style={{fontSize:52,color:SOFT,lineHeight:1.35,marginBottom:30}}>值得回看</div>
      <div style={{position:'relative',height:126,fontSize:100,fontWeight:500,lineHeight:1.2}}>
        <div style={{position:'absolute',opacity:opOld,color:f>98?'#6f6f72':INK}}>每日关注</div>
        <div style={{position:'absolute',opacity:opNew}}>设计收藏</div>
      </div>
      <p style={{fontSize:38,lineHeight:1.55,color:SOFT,margin:'22px 0 0'}}>把内容留下，<br/>也把自己的判断留下。</p>
    </div>
    <div style={{position:'absolute',inset:'0 0 auto',height:155,background:'#f6f6f6'}}/>
    <Corner text="收藏 · 再次发现" n="02"/>
  </AbsoluteFill>;
}

function Lead() {
  const f=useCurrentFrame();
  // blur-slide: words are semantic Chinese segments; all 3 channels share p.
  const line=(words:string[],start:number,size:number,dy:number)=><div style={{display:'flex',justifyContent:'center',gap:size===96?0:12,fontSize:size,lineHeight:1.35,fontWeight:size===96?550:400,color:size===96?INK:SOFT}}>{words.map((w,i)=>{const q=p(f,start+i*3.5,start+i*3.5+20,Easing.out(Easing.cubic));return <span key={w} style={{opacity:q,transform:`translateY(${dy*(1-q)}px)`,filter:`blur(${10*(1-q)}px)`}}>{w}</span>;})}</div>;
  return <AbsoluteFill style={{...surface,justifyContent:'center',alignItems:'center',gap:42}}>
    <Corner text="开源 · 深入项目" n="03"/>
    {line(['开源关注，','不止','一个',' Star。'],7,96,40)}
    {line(['从收藏，','走进','项目','本身。'],39,44,26)}
  </AbsoluteFill>;
}

function Reading() {
  const f=useCurrentFrame(),detail=f>=90;
  const local=detail?f-90:f;
  // Original camera blocking using the copied PageCam; no recreated UI.
  return <AbsoluteFill style={surface}>
    <div style={{position:'absolute',inset:0,clipPath:'inset(195px 90px 80px 570px)'}}>
      <PageCam src={`textures/${detail?'detail':'opensource'}-full.png`} pageH={detail?layout.detail.pageH:layout.opensource.pageH} frame={local} keys={detail?[{frame:0,cx:1070,cy:300,zoom:1.38,rotY:0},{frame:105,cx:1070,cy:340,zoom:1.38,rotY:0},{frame:150,cx:1070,cy:340,zoom:1.38,rotY:0}]:[{frame:0,cx:1070,cy:350,zoom:1.3,rotY:3},{frame:70,cx:1070,cy:385,zoom:1.42,rotY:0},{frame:90,cx:1070,cy:385,zoom:1.42,rotY:0}]}/>
    </div>
    {f>=180&&<div style={{position:'absolute',left:590,right:90,top:766,bottom:80,background:'#fff',opacity:p(f,180,192),borderTop:'1px solid #ddd',display:'flex',alignItems:'center',paddingLeft:30}}><Img src={texture('source-link')} style={{width:500,height:500*layout.sourceLink.height/layout.sourceLink.width}}/></div>}
    <Corner text="阅读 · 从摘要到原始来源" n="04"/>
    <div style={{position:'absolute',left:96,top:330,width:445}}>
      <h2 style={{fontSize:76,fontWeight:550,lineHeight:1.4,margin:0}}>{detail?<>走进<br/>项目本身。</>:<>发现<br/>开源项目。</>}</h2>
      <p style={{fontSize:38,lineHeight:1.7,color:SOFT,marginTop:30}}>{detail?<>中文阅读与个人判读，<br/>保留原始出处。</>:<>按主题梳理，<br/>沿兴趣继续深入。</>}</p>
    </div>
  </AbsoluteFill>;
}

function Outro() {
  const f=useCurrentFrame(),enter=p(f,0,48,Easing.bezier(.4,0,.2,1));
  return <AbsoluteFill style={{...surface,background:'#1c1c1e',color:'#fff'}}>
    <div style={{position:'absolute',left:96,top:64,color:'#bcbcc0',fontSize:34}}>继续探索</div>
    <div style={{position:'absolute',left:360,top:290,width:1200,display:'flex',alignItems:'center',gap:72,transform:`translateY(${60*(1-enter)}px)`,opacity:enter}}>
      <Img src={texture('curation-cut-0')} style={{width:240,height:240,borderRadius:24}}/>
      <div><div style={{fontSize:120,lineHeight:1.35,fontWeight:550}}>陈远</div><div style={{fontSize:42,lineHeight:1.6,color:'#bcbcc0'}}>记录 · 收藏 · 构建</div></div>
    </div>
    <div style={{position:'absolute',left:360,top:680,opacity:p(f,38,60),fontSize:52,color:'#fff'}}>default-coder.lovemyrmb.cn <span style={{marginLeft:28}}>↗</span></div>
    <div style={{position:'absolute',left:360,top:790,opacity:p(f,52,72),fontSize:38,color:'#bcbcc0'}}>打开个人网站</div>
  </AbsoluteFill>;
}

export function Promo() {
  return <AbsoluteFill style={surface}>
    <Sequence {...{from:SHOTS.brand.from,durationInFrames:SHOTS.brand.duration}}><Brand/></Sequence>
    <Sequence from={SHOTS.news.from} durationInFrames={SHOTS.news.duration}><News/></Sequence>
    <Sequence from={SHOTS.collections.from} durationInFrames={SHOTS.collections.duration}><Collections/></Sequence>
    <Sequence from={SHOTS.lead.from} durationInFrames={SHOTS.lead.duration}><Lead/></Sequence>
    <Sequence from={SHOTS.reading.from} durationInFrames={SHOTS.reading.duration}><Reading/></Sequence>
    <Sequence from={SHOTS.outro.from} durationInFrames={SHOTS.outro.duration}><Outro/></Sequence>
  </AbsoluteFill>;
}
