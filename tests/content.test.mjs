import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {catalogs} from '../src/shared/i18n.js';
const bundle=await readFile(new URL('../dist/extension/content.js',import.meta.url),'utf8');
const tick=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<60;i++){if(check())return;await tick(20);}assert.fail('Timed out waiting for content state');}
function harness(body,translate,{raw=false,locale='en'}={}){
  const dom=new JSDOM('<!doctype html><body>'+(raw?body:'<article>'+body+'</article>')+'</body>',{url:'https://example.org/story',runScripts:'outside-only',pretendToBeVisual:true});const {window}=dom;const requests=[];let listener,intersection;
  window.IntersectionObserver=class{constructor(callback){this.callback=callback;this.observed=new Set();intersection=this;}observe(el){this.observed.add(el);}unobserve(el){this.observed.delete(el);}disconnect(){this.observed.clear();}};
  window.chrome={i18n:{getUILanguage:()=>locale},runtime:{onMessage:{addListener(fn){listener=fn;}},async sendMessage(message){requests.push(message);if(message.type==='translate')return translate(message);return {ok:true,result:{cancelled:true}};}}};
  window.eval(bundle);
  const message=value=>new Promise(resolve=>listener(value,{},resolve));
  const start=(runId='test-run')=>message({type:'leaf.start',runId,settings:{scope:'article',model:'fixture',target:'zh-CN',style:'subtle'}});
  const count=()=>window.document.querySelectorAll('[data-leaf-root="translation"]').length;
  const stop=()=>message({type:'leaf.stop'});
  const intersect=(element,isIntersecting)=>{assert.ok(intersection.observed.has(element),'element must remain observed');intersection.callback([{target:element,isIntersecting}]);};
  const pause=()=>window.document.querySelector('[data-leaf-root="toolbar"]').shadowRoot.querySelector('.pause').click();
  return {window,requests,start,stop,count,message,intersect,pause,observed:()=>intersection.observed,close:()=>{stop();window.close();}};
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
  const h=harness('<p>Original sentence.</p>',async()=>({ok:false,error:{code:'subscription_sharing_usage_limit_exceeded',messageKey:'errorUsageLimit',message:'Server fallback'}}));try{await h.start();await until(()=>h.requests.length>0);await tick(100);const s=await h.message({type:'leaf.status'});assert.equal(s.paused,true);assert.match(s.error,/usage limit/);assert.equal(h.count(),0);assert.equal(h.window.document.querySelector('p').textContent,'Original sentence.');assert.equal(h.requests.filter(m=>m.type==='translate').length,1);}finally{h.close();}
});
test('SPA URL changes clear stale content and request authorized continuation',async()=>{
  const h=harness('<p>Current page.</p>',async m=>reply(m));try{await h.start();await until(()=>h.count()===1);h.window.history.pushState({},'', '/new-page');const p=h.window.document.createElement('p');p.textContent='Different page.';h.window.document.querySelector('article').replaceChildren(p);await until(()=>h.requests.some(m=>m.type==='navigatePage'));assert.equal(h.count(),0);assert.ok(!h.requests.some(m=>m.type==='stopPage'));await h.start('continued-run');await until(()=>h.count()===1);assert.equal(h.requests.filter(m=>m.type==='translate').length,2);}finally{h.close();}
});

test('popstate requests continuation and a paused navigation stays paused',async()=>{
  const h=harness('<p>Current page.</p>',async m=>reply(m));
  try{
    await h.start();await until(()=>h.count()===1);h.pause();await until(()=>h.requests.some(m=>m.type==='pausePage' && m.paused));
    h.window.history.replaceState({},'', '/previous');h.window.dispatchEvent(new h.window.PopStateEvent('popstate'));
    assert.equal(h.count(),0);assert.ok(h.requests.some(m=>m.type==='navigatePage'));
    await h.message({type:'leaf.start',runId:'continued',paused:true,settings:{scope:'article',model:'fixture',target:'zh-CN',style:'subtle'}});
    await tick(50);assert.equal(h.count(),0);assert.equal((await h.message({type:'leaf.status'})).paused,true);
    h.pause();await until(()=>h.count()===1);
  }finally{h.close();}
});

test('new sibling posts translate while continuous mutations never become quiet',async()=>{
  const h=harness('<main><article><p>First post.</p></article></main>',async m=>reply(m),{raw:true});let churn;
  try{
    await h.start();await until(()=>h.count()===1);
    const main=h.window.document.querySelector('main');
    main.insertAdjacentHTML('beforeend','<article><p>Loaded while scrolling.</p></article>');
    let n=0;churn=setInterval(()=>{main.className='scroll-'+n++;},40);
    await until(()=>h.count()===2);
    assert.ok(h.requests.some(m=>m.items?.some(i=>i.text==='Loaded while scrolling.')));
  }finally{clearInterval(churn);h.close();}
});

test('the same text node keeps translating successive changes during continuous page activity',async()=>{
  const h=harness('<p id="changing">First version.</p><div id="animation"></div>',async m=>reply(m));let churn;
  try{
    await h.start();await until(()=>h.count()===1);
    const node=h.window.document.querySelector('#changing').firstChild;
    const animation=h.window.document.querySelector('#animation');let n=0;
    churn=setInterval(()=>{animation.className='frame-'+n++;},35);
    for(const text of ['Second version.','Third version.','Fourth version.']){
      node.data=text;
      await until(()=>h.window.document.querySelector('[data-leaf-root="translation"]')?.shadowRoot.querySelector('.translation').textContent==='译文 '+text);
      assert.equal(h.count(),1);assert.equal(h.window.document.querySelector('#changing').firstChild,node);
    }
  }finally{clearInterval(churn);h.close();}
});

test('many virtual-list cycles translate fresh posts and release removed observers',async()=>{
  const h=harness('<main><article><p>Post zero.</p></article></main>',async m=>reply(m),{raw:true});
  try{
    await h.start();await until(()=>h.count()===1);const main=h.window.document.querySelector('main');
    for(let i=1;i<=5;i++){
      main.firstElementChild.remove();main.insertAdjacentHTML('beforeend',`<article><p>Post number ${i}.</p></article>`);
      await until(()=>h.count()===1 && h.window.document.querySelector('[data-leaf-root="translation"]').shadowRoot.querySelector('.translation').textContent===`译文 Post number ${i}.`);
      assert.equal(h.observed().size,1);
    }
  }finally{h.close();}
});

test('offscreen posts are deferred until intersection and removed feed elements are unobserved',async()=>{
  const h=harness('<main><article><p>First.</p></article><article><p id="later">Later.</p></article></main>',async m=>reply(m),{raw:true});
  try{
    const later=h.window.document.querySelector('#later');later.getBoundingClientRect=()=>({top:5000,bottom:5020});
    await h.start();await until(()=>h.count()===1);assert.equal(h.requests.filter(m=>m.type==='translate').length,1);
    h.intersect(later,true);await until(()=>h.count()===2);
    later.parentElement.remove();await until(()=>!h.observed().has(later));
    assert.equal(h.count(),1);
  }finally{h.close();}
});

test('virtualized source replacement during a request discards the old response',async()=>{
  const pending=[];const h=harness('<p id="post"><span>Old post.</span></p>',m=>new Promise(resolve=>pending.push(()=>resolve(reply(m)))));
  try{
    await h.start();await until(()=>pending.length===1);
    const p=h.window.document.querySelector('#post');p.replaceChildren(h.window.document.createTextNode('New post.'));
    pending.shift()();await tick(30);assert.equal(h.count(),0);
    await until(()=>pending.length===1);pending.shift()();await until(()=>h.count()===1);
    assert.equal(p.querySelector('[data-leaf-root]').shadowRoot.querySelector('.translation').textContent,'译文 New post.');
  }finally{h.close();}
});

test('recycled links with unchanged text update the translation link destination',async()=>{
  const h=harness('<p><a href="/old">Read this post.</a></p>',async m=>reply(m));
  try{
    await h.start();await until(()=>h.count()===1);
    h.window.document.querySelector('p a').href='/new';
    await until(()=>h.window.document.querySelector('[data-leaf-root="translation"]').shadowRoot.querySelector('a').pathname==='/new');
    assert.equal(h.count(),1);
  }finally{h.close();}
});

test('removing one run keeps other runs on the same element observed',async()=>{
  const h=harness('<div id="runs">First run.<button>Skip</button>Second run.</div>',async m=>reply(m));
  try{
    await h.start();await until(()=>h.count()===2);
    const element=h.window.document.querySelector('#runs');element.firstChild.remove();
    await until(()=>h.count()===1);h.intersect(element,false);h.intersect(element,true);
    await h.stop();assert.equal(h.observed().size,0);
  }finally{h.close();}
});

test('pause defers appended posts and resume translates them once',async()=>{
  const h=harness('<p>Initial.</p>',async m=>reply(m));
  try{
    await h.start();await until(()=>h.count()===1);h.pause();
    h.window.document.querySelector('article').insertAdjacentHTML('beforeend','<p>During pause.</p>');
    await tick(550);assert.equal(h.count(),1);assert.equal(h.requests.filter(m=>m.type==='translate').length,1);
    h.pause();await until(()=>h.count()===2);assert.equal(h.requests.filter(m=>m.type==='translate').length,2);
  }finally{h.close();}
});

test('stop and enable again isolate late responses and clear prior work',async()=>{
  const pending=[];const h=harness('<p>Post.</p>',m=>new Promise(resolve=>pending.push({runId:m.runId,finish:()=>resolve(reply(m))})));
  try{
    await h.start('old');await until(()=>pending.length===1);await h.stop();await h.start('new');await until(()=>pending.length===2);
    pending[0].finish();await tick(30);assert.equal(h.count(),0);
    assert.equal((await h.message({type:'leaf.status'})).working,true);
    pending[1].finish();await until(()=>h.count()===1);await h.stop();
    h.window.document.querySelector('p').textContent='After stop.';await tick(500);assert.equal(h.count(),0);
    assert.equal(h.requests.filter(m=>m.type==='translate').length,2);
  }finally{h.close();}
});

for(const locale of Object.keys(catalogs))test(`${locale}: page toolbar follows browser UI locale through pause/resume`,async()=>{
  const h=harness('<p>Source sentence.</p>',async m=>reply(m),{locale});
  try{await h.start();await until(()=>h.count()===1);const host=h.window.document.querySelector('[data-leaf-root="toolbar"]'),root=host.shadowRoot;assert.equal(host.lang,locale);assert.equal(root.querySelector('.pause').textContent,catalogs[locale].pause);h.pause();assert.equal(root.querySelector('.pause').textContent,catalogs[locale].resume);assert.ok(root.querySelector('.status').textContent.includes(catalogs[locale].paused));h.pause();assert.equal(root.querySelector('.pause').textContent,catalogs[locale].pause);assert.equal(root.querySelectorAll('button')[1].textContent,catalogs[locale].restore);}finally{h.close();}
});
