import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';

const bundle=await readFile(new URL('../dist/extension/background.js',import.meta.url),'utf8');
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},async emit(...args){await Promise.all(this.listeners.map(fn=>fn(...args)));}});
function harness(locale='en'){
  const id='test-extension',messages=[],injections=[],nativeMessages=[],menus=[];
  let saved=[],tab={id:1,url:'https://example.org/start',status:'complete'},documentId='doc-1',injectionGate;
  const onNative=event(),port={onMessage:onNative,onDisconnect:event(),postMessage(message){
    nativeMessages.push(message);
    if(message.method==='login')queueMicrotask(()=>onNative.emit({id:message.id,ok:true,result:{pending:true}}));
    if(message.method==='status')queueMicrotask(()=>onNative.emit({id:message.id,ok:true,result:{active:'test',profiles:[{id:'test',sharing:true}]}}));
  }};
  const chrome={i18n:{getUILanguage:()=>locale},
    runtime:{id,getURL:path=>`chrome-extension://${id}/${path}`,onMessage:event(),onInstalled:event(),onStartup:event(),connectNative:()=>port,sendMessage:async()=>{},openOptionsPage:async()=>{}},
    storage:{session:{get:async()=>({sessions:saved}),set:async value=>{saved=structuredClone(value.sessions);}},local:{get:async()=>({settings:{model:'fixture'}})}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    scripting:{executeScript:async value=>{injections.push(value);if(injectionGate)await injectionGate;return [{documentId}];}},
    tabs:{get:async()=>({...tab}),sendMessage:async(tabId,message,options)=>{messages.push({tabId,...message,...options});return {active:message.type!=='leaf.stop'};},query:async()=>[tab],onRemoved:event(),onUpdated:event()},
    contextMenus:{onClicked:event(),removeAll:fn=>fn(),create:menu=>menus.push(menu)},commands:{onCommand:event()}
  };
  runInNewContext(bundle,{chrome,crypto:{randomUUID},URL,setTimeout,clearTimeout,console});
  const ui={id,url:`chrome-extension://${id}/popup.html`};
  const rpc=(message,sender=ui)=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0](message,sender,resolve));
  const start=async()=>{assert.equal((await rpc({type:'startPage',tabId:1})).ok,true);};
  const session=()=>saved.find(([id])=>id===1)?.[1];
  const fromPage=message=>rpc({...message,runId:session()?.runId},{id,url:tab.url,tab:{id:1},documentId:session()?.documentId});
  const navigate=async(url,{loading=false,newDocument=false}={})=>{
    tab={...tab,url,status:loading?'loading':'complete'};if(newDocument)documentId='doc-'+randomUUID();
    await chrome.tabs.onUpdated.emit(1,{url,status:tab.status},{...tab});
  };
  const complete=async()=>{tab.status='complete';await chrome.tabs.onUpdated.emit(1,{status:'complete'},{...tab});};
  return {chrome,messages,injections,nativeMessages,menus,rpc,start,session,fromPage,navigate,complete,gate:promise=>{injectionGate=promise;}};
}

test('same-document push/replace/back/forward routes resume without another user gesture',async()=>{
  const h=harness();await h.start();const first=h.session().runId;
  for(const url of ['/push','/replace','/start','/replace']){
    await h.navigate('https://example.org'+url);
    assert.equal(h.messages.at(-1).type,'leaf.start');assert.equal(h.session().url,'https://example.org'+url);
    assert.equal(h.session().documentId,'doc-1');assert.equal(h.messages.at(-1).paused,false);
  }
  assert.notEqual(h.session().runId,first);
  const starts=h.messages.filter(m=>m.type==='leaf.start').length;await h.complete();
  assert.equal(h.messages.filter(m=>m.type==='leaf.start').length,starts,'duplicate complete event must not restart');
});

test('same-origin new documents reinject on completion and preserve pause',async()=>{
  const h=harness();await h.start();await h.fromPage({type:'pausePage',paused:true});
  const previous=h.session().documentId;await h.navigate('https://example.org/next',{loading:true,newDocument:true});
  assert.equal(h.session().documentId,null);assert.equal(h.injections.length,1);
  await h.complete();assert.notEqual(h.session().documentId,previous);assert.equal(h.injections.length,2);
  assert.equal(h.messages.at(-1).paused,true);
  await h.fromPage({type:'pausePage',paused:false});await h.navigate('https://example.org/third');
  assert.equal(h.messages.at(-1).paused,false);
});

test('explicit stop prevents later automatic translation',async()=>{
  const h=harness();await h.start();await h.rpc({type:'stopPage',tabId:1});
  await h.navigate('https://example.org/next',{newDocument:true});
  assert.equal(h.session(),undefined);assert.equal(h.injections.length,1);assert.equal(h.messages.at(-1).type,'leaf.stop');
});

test('cross-origin, changed port and unsupported URLs revoke continuation',async()=>{
  for(const url of ['https://other.org/','https://example.org:8443/','http://example.org/','chrome://settings/']){
    const h=harness();await h.start();await h.navigate(url,{newDocument:true});
    assert.equal(h.session(),undefined);assert.equal(h.injections.length,1);
  }
});

test('stop during asynchronous injection cannot resurrect a session',async()=>{
  const h=harness();await h.start();let release;h.gate(new Promise(resolve=>{release=resolve;}));
  const pending=h.navigate('https://example.org/next',{newDocument:true});
  await new Promise(resolve=>setImmediate(resolve));await h.rpc({type:'stopPage',tabId:1});release();await pending;
  assert.equal(h.session(),undefined);assert.equal(h.messages.filter(m=>m.type==='leaf.start').length,1);
});

test('a superseded navigation cannot start translation for the old URL',async()=>{
  const h=harness();await h.start();let release;h.gate(new Promise(resolve=>{release=resolve;}));
  const pending=h.navigate('https://example.org/intermediate',{newDocument:true});
  await new Promise(resolve=>setImmediate(resolve));
  await h.navigate('https://example.org/final',{loading:true,newDocument:true});release();await pending;h.gate(null);
  await h.complete();assert.equal(h.session().url,'https://example.org/final');
  assert.equal(h.messages.filter(m=>m.type==='leaf.start').length,2);
});

test('previous document/run cannot submit work after same-origin continuation',async()=>{
  const h=harness();await h.start();const old={...h.session()};await h.navigate('https://example.org/next',{newDocument:true});
  const response=await h.rpc({type:'translate',runId:old.runId,items:[{id:'one',text:'Old source'}]},{id:'test-extension',tab:{id:1},documentId:old.documentId,url:old.url});
  assert.equal(response.ok,false);assert.equal(response.error.code,'CANCELLED');
  assert.equal(h.nativeMessages.filter(m=>m.method==='translate').length,0);
});

test('context menus and native callback locale follow browser UI language',async()=>{
  const {catalogs}=await import('../src/shared/i18n.js');
  for(const locale of Object.keys(catalogs)){const h=harness(locale);await h.chrome.runtime.onInstalled.emit();await h.chrome.runtime.onStartup.emit();assert.equal(h.menus.length,2);assert.ok(h.menus.every(m=>m.title===catalogs[locale].contextToggle));await h.rpc({type:'login'});assert.equal(h.nativeMessages.find(m=>m.method==='login').params.locale,locale);assert.equal(h.nativeMessages.find(m=>m.method==='login').params.target,undefined);}
});
