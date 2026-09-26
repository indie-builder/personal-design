// Test-only OpenAI-compatible provider for the current Pi + official OpenUI protocol.
import { createServer } from 'node:http';
const requests=[];
const summary='用户的团队预算为3000元，需要移动端协作与客户只读查看。';
const basic='root = Stack([card]);\ncard = Card([CardHeader("需求确认"), TextContent("团队预算为3000元，建议先试用团队版。")]);';
createServer(async(req,res)=>{
 if(req.url==='/requests'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(requests));return;}
 if(req.url==='/reset'){requests.length=0;res.end('ok');return;}
 let body='';for await(const chunk of req)body+=chunk;
 // 非模型请求（如探活）只回错误码，不让夹具进程崩溃退出
 let data;try{data=JSON.parse(body)}catch{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'invalid JSON body'}}));return;}
 if(!Array.isArray(data?.messages)){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'messages array required'}}));return;}
 data.messages=data.messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n'):m.content}));
 requests.push(data);
 const last=data.messages.at(-1).content;
 if(last.includes('触发服务错误')){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Test rate limit'}}));return;}
 const output=data.messages.some(m=>m.content?.includes('你是对话记忆整理器'))?summary
  :last.includes('修正刚才的界面结构')?'root = Stack([card, next]);'
  :last.includes('触发结构修复')?basic+'\nnext = Button("继续", Action([@ToAssistant("继续方案")]));'
  :basic;
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
 const emit=(delta,finish_reason=null)=>res.write(`data: ${JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model:'glm-5.3-flash',choices:[{index:0,delta,finish_reason}]})}\n\n`);
 emit({role:'assistant',content:''});let index=0;
 const timer=setInterval(()=>{if(index>=output.length){clearInterval(timer);emit({},'stop');res.end('data: [DONE]\n\n');return;}emit({content:output.slice(index,index+24)});index+=24;},last.includes('慢速回答')?250:15);
 res.on('close',()=>clearInterval(timer));
}).listen(3907,'127.0.0.1',()=>console.log('Test provider: http://127.0.0.1:3907'));
