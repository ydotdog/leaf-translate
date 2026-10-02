import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('../dist/extension/content.js',import.meta.url),'utf8');
const tick=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<60;i++){if(check())return;await tick(20);}assert.fail('Timed out waiting for content state');}
function harness(body,translate){
  const dom=new JSDOM('<!doctype html><body><article>'+body+'</article></body>',{url:'https://example.org/story',runScripts:'outside-only',pretendToBeVisual:true});const {window}=dom;const requests=[];let listener;
  window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  window.chrome={runtime:{onMessage:{addListener(fn){listener=fn;}},async sendMessage(message){requests.push(message);if(message.type==='translate')return translate(message);return {ok:true,result:{cancelled:true}};}}};
  window.eval(bundle);
  const message=value=>new Promise(resolve=>listener(value,{},resolve));
  const start=()=>message({type:'leaf.start',runId:'test-run',settings:{scope:'article',model:'fixture',target:'zh-CN',style:'subtle'}});
  const count=()=>window.document.querySelectorAll('[data-leaf-root="translation"]').length;
  const stop=()=>message({type:'leaf.stop'});
  return {window,requests,start,stop,count,message,close:()=>{stop();window.close();}};
}
const reply=m=>({ok:true,result:m.items.map(item=>({id:item.id,text:'译文 '+item.text}))});

test('visible paragraphs are batched and stop during flight never reinserts a translation',async()=>{
  let finish;const h=harness('<p>First sentence.</p><p>Second sentence.</p>',m=>new Promise(resolve=>{finish=()=>resolve(reply(m));}));
  try{await h.start();await until(()=>finish);assert.equal(h.requests.find(m=>m.type==='translate').items.length,2);await h.stop();finish();await tick(80);assert.equal(h.count(),0);assert.equal(h.window.document.querySelector('[data-leaf-root="toolbar"]'),null);}finally{h.close();}
});
test('dynamic paragraph changes replace stale translations instead of appending duplicates',async()=>{
  const h=harness('<p id="text">Before.</p>',async m=>reply(m));try{await h.start();await until(()=>h.count()===1);h.window.document.querySelector('#text').firstChild.textContent='After.';await until(()=>h.requests.filter(m=>m.type==='translate').length===2 && h.count()===1);const text=h.window.document.querySelector('[data-leaf-root="translation"]').shadowRoot.querySelector('.translation').textContent;assert.equal(text,'译文 After.');}finally{h.close();}
});
test('quota error pauses the queue without repeated calls and keeps original content',async()=>{
  const h=harness('<p>Original sentence.</p>',async()=>({ok:false,error:{code:'subscription_sharing_usage_limit_exceeded',message:'额度受限'}}));try{await h.start();await until(()=>h.requests.length>0);await tick(100);const s=await h.message({type:'leaf.status'});assert.equal(s.paused,true);assert.equal(s.error,'额度受限');assert.equal(h.count(),0);assert.equal(h.window.document.querySelector('p').textContent,'Original sentence.');assert.equal(h.requests.filter(m=>m.type==='translate').length,1);}finally{h.close();}
});
test('SPA URL changes restore translations and stop further requests',async()=>{
  const h=harness('<p>Current page.</p>',async m=>reply(m));try{await h.start();await until(()=>h.count()===1);h.window.history.pushState({},'', '/new-page');const p=h.window.document.createElement('p');p.textContent='Different page.';h.window.document.querySelector('article').append(p);await until(()=>h.count()===0);assert.equal(h.requests.filter(m=>m.type==='translate').length,1);assert.ok(h.requests.some(m=>m.type==='stopPage'));}finally{h.close();}
});
