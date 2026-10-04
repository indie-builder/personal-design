import assert from 'node:assert/strict';
import test from 'node:test';
import { browseHref, browseMemoryKey, resolveUrlBrowseContext } from './browse-context.ts';
const path='/products/layout-compositions';
const entries=[
 {href:`${path}/001`,title:'First',category:'构图',theme:'balance'},
 {href:`${path}/002`,title:'Second',category:'构图',theme:'balance'},
 {href:`${path}/003`,title:'Third',category:'字体',theme:'grid'},
];
test('links preserve category, theme and search',()=>{
 assert.equal(browseHref(entries[0].href,`${path}?cat=构图&theme=balance&q=First&unused=1`),`${entries[0].href}?browse=2&cat=%E6%9E%84%E5%9B%BE&theme=balance&q=First`);
});
test('search constrains adjacent works and is preserved on return',()=>{
 const result=resolveUrlBrowseContext('browse=2&cat=构图&q=First',path,entries[0].href,entries);
 assert.deepEqual(result.entries,entries.slice(0,1));
 const url=new URL(result.href,'https://example.test');
 assert.equal(url.searchParams.get('q'),'First');
 assert.equal(url.searchParams.get('cat'),'构图');
 assert.equal(url.searchParams.get('page'),'001');
});
test('theme and category still constrain the browsing context',()=>{
 assert.equal(resolveUrlBrowseContext('browse=2&cat=构图&theme=balance',path,entries[0].href,entries).entries.length,2);
 assert.equal(resolveUrlBrowseContext('browse=2&cat=字体',path,entries[0].href,entries),null);
 assert.equal(resolveUrlBrowseContext('',path,entries[0].href,entries),null);
});
test('return memory keys separate searches and categories',()=>{
 assert.notEqual(browseMemoryKey('return',`${path}?cat=构图&q=abc`),browseMemoryKey('return',`${path}?cat=构图`));
 assert.notEqual(browseMemoryKey('return',path),browseMemoryKey('return',`${path}?cat=构图`));
});
test('retired session markers fall back to the normal detail navigation',()=>{
 assert.equal(resolveUrlBrowseContext('browse=1&cat=构图&q=First',path,entries[0].href,entries),null);
});
