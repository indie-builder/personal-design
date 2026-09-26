import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibrary, defineComponent, createParser } from '@openuidev/react-lang';
import { z } from 'zod';
import { uniqueOpenUiReferences } from './openui-content.ts';

const Button = defineComponent({name:'FollowUp',description:'',props:z.object({label:z.string(),message:z.string()}),component:()=>null});
const Card = defineComponent({name:'Card',description:'',props:z.object({title:z.string(),children:z.array(Button.ref)}),component:()=>null});
const Stack = defineComponent({name:'Stack',description:'',props:z.object({children:z.array(z.union([Card.ref,Button.ref]))}),component:()=>null});
const library=createLibrary({components:[Stack,Card,Button],root:'Stack'});
const parse=text=>createParser(library.toJSONSchema(),library.root).parse(text).root.props.children;

test('same OpenUI statement referenced in a card and root renders once',()=>{
 const children=parse('root = Stack([card, next]);\ncard = Card("方案对比", [next]);\nnext = FollowUp("帮我选一个", "推荐方案");');
 const result=uniqueOpenUiReferences(children);
 assert.equal(result.length,1);
 assert.equal(result[0].props.children.length,1);
 assert.equal(result[0].props.children[0].props.label,'帮我选一个');
 assert.equal(children.length,2,'original model response is preserved');
 assert.deepEqual(uniqueOpenUiReferences(children),result,'each render starts a new reference scope');
});
test('same labels with distinct statement IDs remain separate',()=>{
 const result=uniqueOpenUiReferences(parse('root = Stack([a,b]);\na = FollowUp("继续", "方案一");\nb = FollowUp("继续", "方案二");'));
 assert.equal(result.length,2);
});
test('ordinary values and partially streamed nodes are preserved',()=>{
 const value=[{type:'element',props:{children:['相同','相同',null]}},{type:'element',props:{label:'未完成'}}];
 assert.deepEqual(uniqueOpenUiReferences(value),value);
});
