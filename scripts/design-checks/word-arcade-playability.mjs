// Assisted physics solvability check, NOT a manual-player difficulty benchmark.
import { readFileSync, writeFileSync } from 'node:fs';
import { Arcade } from '../../packages/word-arcade/src/game.ts';
import { resolve, dirname } from 'node:path';
if (!process.argv[2]) throw new Error('Pass the JSON layouts captured from the built-in browser');
const layoutFile = resolve(process.argv[2]);
const layouts=JSON.parse(readFileSync(layoutFile));
const output=[];
for (const [viewport,layout] of Object.entries(layouts)) for(const kind of ['breakout','snake','invaders','ducks','runner']) {
  let seed=17;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const g=new Arcade(kind,layout.width,layout.height,layout.letters,random);g.start();
  const rows=[];for(const b of g.bricks){let row=rows.find(r=>Math.abs(r.y-(b.y+b.h/2))<3);if(!row){row={y:b.y+b.h/2,letters:[]};rows.push(row)}row.letters.push(b)}rows.sort((a,b)=>a.y-b.y);
  const path=[{x:50,y:g.snake.y}];for(const row of rows)path.push({x:50,y:row.y},{x:g.width-50,y:row.y},{x:g.width-50,y:g.floor-60},{x:50,y:g.floor-60});let waypoint=0;
  let elapsed=0,events=0;
  for(;elapsed<180&&g.state!=='over'&&g.state!=='cleared';elapsed+=1/120){
    if(g.state==='miss')g.start();
    if(kind==='breakout'){
      let offset=0;if(g.ball.vy>0){const b=g.bricks.filter(b=>b.alive).sort((a,b)=>Math.abs(a.x-g.ball.x)-Math.abs(b.x-g.ball.x))[0];if(b){const angle=Math.atan2(b.x+b.w/2-g.ball.x,g.floor-22-b.y);offset=Math.max(-44,Math.min(44,angle/(Math.PI/3)*48));}}
      g.pointer.x=g.ball.x-offset;
    }
    if(kind==='invaders'){
      const b=g.bricks.find(b=>b.alive);if(b)g.pointer.x=b.x+b.w/2+g.direction*25;
    }
    if(kind==='ducks'&&elapsed>events*.3){events++;const b=g.bricks.find(b=>b.active);if(b)g.act(b.x+b.w/2,b.y+b.h/2);}
    if(kind==='runner'){
      const speed=Math.min(720,280+g.time*9)*g.pace*Math.min(1,g.width/650);
      if(g.bricks.some(b=>b.active&&b.age>.45&&b.x>60&&b.x-60<speed*.24))g.act();
    }
    if(kind==='snake'){
      let p=path[waypoint];if(p&&Math.hypot(p.x-g.snake.x,p.y-g.snake.y)<20)waypoint++;
      p=path[waypoint];if(!p){waypoint=1;p=path[waypoint];}g.pointer=p;
    }
    g.step(1/120);
  }
  output.push({viewport:Number(viewport),game:kind,state:g.state,seconds:+elapsed.toFixed(1),score:g.score,lives:g.lives,remaining:g.bricks.filter(b=>kind==='runner'?b.headline&&!b.passed:b.alive&&(kind!=='ducks'||b.headline)).map(b=>b.text).join('')});
}
writeFileSync(resolve(dirname(layoutFile), 'solvability.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
