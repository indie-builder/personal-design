#!/bin/sh
# Content-independent stress cases: no business case, provider or real API calls.
set -eu
{
node --input-type=module <<'CONFIG'
const base=process.env.DESIGN_BASE_URL;if(!/^http:\/\/localhost:\d+$/.test(base||''))throw Error('Use isolated localhost');console.log('const config='+JSON.stringify({base,space:Number(process.env.EGO_TASK_SPACE),root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default,fs=await import('node:fs/promises');const t=await taskSpace(config.space),p=t.page('p1'),out=config.root+'/docs/design/execution/evidence/ai-chat-contract';await fs.mkdir(out,{recursive:true});
const label='请核对全部信息后确认并继续下一步';const word='ExtremelyLongUnbrokenValue'.repeat(7);
const responses=[
 `root = Stack([CardHeader("长内容与操作", "${label}"), TextContent("${word}"), Buttons([Button("${label}", Action([@ToAssistant("确认")]), "primary"), Button("Review the complete information before returning", Action([@ToAssistant("返回")]), "primary")])])`,
 `root = Stack([CardHeader("多操作与角色", "同一组只有一个强调操作"), Buttons([Button("保存", Action([@ToAssistant("保存")]), "primary"),Button("另一个操作", Action([@ToAssistant("另一个")]), "primary"),Button("删除内容", Action([@ToAssistant("删除")]), "primary", "destructive"),Button("详情", Action([@ToAssistant("详情")]), "tertiary"),Button("帮助", Action([@ToAssistant("帮助")]), "tertiary")])])`,
 `root = Stack([CardHeader("输入与长选项", "占位、填写和错误"), Form("generic-form",Buttons([Button("提交检查",Action([@ToAssistant("提交")]))]),[FormControl("必填字段",Input("empty-required","${label}","text",{required:true})),FormControl("选择",Select("long-select",[SelectItem("one","${label}")],"${label}")),FormControl("选项",RadioGroup("long-radio",[RadioItem("${label}","${word}","one"),RadioItem("另一项","可选说明","two")],"one")),FormControl("选择卡片",OptionCards("cards","single",[OptionCard("one","${label}","${word}"),OptionCard("disabled","暂不可用","此项禁用",null,true)]))])])`,
 `root = Stack([CardHeader("结构化数据", "宽表保留数据并在内部滚动"), Table([Col("长标题一",["${word}","内容"]),Col("长标题二",[1,2]),Col("长标题三",[3,4]),Col("长标题四",[5,6]),Col("长标题五",[7,8]),Col("长标题六",[9,10])]),MetricIndicatorInline("12345678901234567890","较长数值不裁掉"),TextContent("暂无数据，请提供数据后继续。"),Table([]),ImageGallery([]),LineChart([],[])])])`,
 `root = Stack([CardHeader("纯内容回答", "无需人为添加下一步"), TextContent("这是独立说明，可以直接阅读，不需要表单或按钮。"), CodeBlock("text","${word}"), Accordion([AccordionItem("detail","${label}",[TextContent("${word}")])])])`
];
const fixture={id:'contract-fixture',agentId:'general',title:'通用组件边界检查',messages:responses.map((text,i)=>({id:'contract-'+i,role:'assistant',parts:[{type:'text',text}]}))};
await p.goto(config.base+'/products/ai-chat');await p.evaluate(c=>{const key='personal-design:ai-chat:v1';if(JSON.parse(localStorage.getItem(key)||'{}').conversations?.some(x=>!['case-fixture','component-fixture','contract-fixture'].includes(x.id)))throw Error('User records');localStorage.setItem(key,JSON.stringify({agents:[],conversations:[c]}));},fixture);await p.reload();await p.waitForSelector('.ai-openui');
const makeLatest=async id=>{await p.evaluate(id=>{const k='personal-design:ai-chat:v1',s=JSON.parse(localStorage.getItem(k));if(s.conversations.some(c=>!['component-fixture','contract-fixture'].includes(c.id)))throw Error('Not test records');const c=s.conversations[0],i=c.messages.findIndex(m=>m.id===id);if(i<0)throw Error('Missing test message');c.messages.push(...c.messages.splice(i,1));localStorage.setItem(k,JSON.stringify(s));},id);await p.reload();await p.waitForSelector('.ai-openui');};
const checks=[];
for(const [width,theme]of [[320,'light'],[390,'dark'],[1440,'light']]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640});await p.evaluate(x=>document.documentElement.dataset.theme=x,theme);
 const result=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,answerOverflow:[...document.querySelectorAll('.ai-openui')].map((e,i)=>({i,width:e.clientWidth,scroll:e.scrollWidth})).filter(e=>e.scroll>e.width+1),errors:[...document.querySelectorAll('[role=status]')].filter(e=>e.textContent.includes('未能')).length,primary:[...document.querySelectorAll('.openui-buttons')].map(e=>e.querySelectorAll('.openui-button-base-primary').length),destructivePrimary:document.querySelectorAll('.openui-button-base-destructive-primary').length,disabled:document.querySelector('.openui-option-card[disabled]')?.disabled}));assert(!result.overflow);assert.equal(result.errors,0);assert.equal(result.answerOverflow.length,0,JSON.stringify(result));assert(result.primary.every(n=>n<=1));assert.equal(result.destructivePrimary,0);assert.equal(result.disabled,true);
 await makeLatest('contract-2');await p.click('button:text-is("提交检查")');await p.waitForSelector('.openui-hint-error');
 checks.push({width,theme,...result});for(const i of [0,1,2,3,4]){await p.evaluate(i=>{const s=document.querySelector('[aria-label="对话"]>div'),el=document.querySelectorAll('.ai-openui')[i];s.scrollTop+=el.getBoundingClientRect().top-s.getBoundingClientRect().top-96;},i);await p.screenshot({path:out+`/${width}-${theme}-${i}.png`});}
}
await makeLatest('contract-1');await p.evaluate(()=>{window.__contractRequest=null;const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/api/ai-chat')){window.__contractRequest=JSON.parse(args[1].body);return new Response([{role:'assistant'},{content:'root = Stack([TextContent("已收到操作。")])'},{}].map((delta,i)=>JSON.stringify({choices:[{index:0,delta,finish_reason:i===2?'stop':null}]})).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}});}return original(...args);};});
await p.click('button:text-is("另一个操作")');await p.waitForFunction(()=>!!window.__contractRequest&&!document.querySelector('[data-generation-status]'));assert.equal(await p.evaluate(()=>window.__contractRequest.messages.filter(m=>m.role==='user').at(-1).parts[0].text),'另一个');
await p.cdp('Emulation.clearDeviceMetricsOverride');await fs.writeFile(out+'/result.json',JSON.stringify({passed:true,actionPayloadPreserved:true,checks},null,2)+'\n');console.log(checks);
JS
} | ego-browser nodejs
