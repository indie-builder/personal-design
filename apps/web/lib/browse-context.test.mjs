import assert from 'node:assert/strict';
import test from 'node:test';
import { browseHref, browseMemoryKey, resolveUrlBrowseContext } from './browse-context.ts';
const path='/products/muse';
const entries=[
 {href:`${path}/001`,title:'First',category:'Product'},
 {href:`${path}/002`,title:'Second',category:'Product'},
 {href:`${path}/003`,title:'Third',category:'Web'},
];
test('links preserve muse category and search without unrelated parameters',()=>{
 assert.equal(browseHref(entries[0].href,`${path}?cat=Product&theme=balance&q=First&unused=1`),`${entries[0].href}?browse=2&cat=Product&q=First`);
});
test('search constrains adjacent works and is preserved on return',()=>{
 const result=resolveUrlBrowseContext('browse=2&cat=Product&q=First',path,entries[0].href,entries);
 assert.deepEqual(result.entries,entries.slice(0,1));
 const url=new URL(result.href,'https://example.test');
 assert.equal(url.searchParams.get('q'),'First');
 assert.equal(url.searchParams.get('cat'),'Product');
});
test('category constrains the browsing context',()=>{
 assert.equal(resolveUrlBrowseContext('browse=2&cat=Product',path,entries[0].href,entries).entries.length,2);
 assert.equal(resolveUrlBrowseContext('browse=2&cat=Web',path,entries[0].href,entries),null);
 assert.equal(resolveUrlBrowseContext('',path,entries[0].href,entries),null);
});
test('return memory keys separate searches and categories',()=>{
 assert.notEqual(browseMemoryKey('return',`${path}?cat=构图&q=abc`),browseMemoryKey('return',`${path}?cat=构图`));
 assert.notEqual(browseMemoryKey('return',path),browseMemoryKey('return',`${path}?cat=构图`));
});
test('retired session markers fall back to the normal detail navigation',()=>{
 assert.equal(resolveUrlBrowseContext('browse=1&cat=构图&q=First',path,entries[0].href,entries),null);
});
