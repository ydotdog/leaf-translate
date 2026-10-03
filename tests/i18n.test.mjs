import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {catalogs,resolveLocale,t,errorText,localizeDocument} from '../src/shared/i18n.js';
import {AppError,publicError,DEFAULTS} from '../src/shared/protocol.js';
import {callbackPage} from '../src/native/callback-page.js';
const keys=Object.keys(catalogs.en).sort();
const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();

test('locale resolution honors Chinese script, then region, with English fallback',()=>{
  const cases={'en-US':'en',fr:'en','ar-EG':'en',undefined:'en','zh':'zh-CN','zh_CN':'zh-CN','zh-SG':'zh-CN','zh-Hans-HK':'zh-CN','zh-TW':'zh-TW','zh-HK':'zh-TW','zh-MO':'zh-TW','zh-Hant-CN':'zh-TW'};
  for(const [input,expected] of Object.entries(cases))assert.equal(resolveLocale(input),expected,input);
});
test('all catalogs have complete matching keys and placeholders',()=>{
  for(const [locale,messages] of Object.entries(catalogs)){
    assert.deepEqual(Object.keys(messages).sort(),keys,locale);
    for(const key of keys){assert.ok(messages[key].trim(),`${locale}.${key}`);assert.deepEqual(placeholders(messages[key]),placeholders(catalogs.en[key]),`${locale}.${key}`);}
  }
  assert.equal(t('missing',{},'fr'),catalogs.en.errorUnexpected);
  assert.equal(t('progress',{done:2,total:8,state:'Paused'},'en'),'2 / 8 blocks · Paused');
});
test('known native errors localize and unknown upstream messages are never rendered',()=>{
  const error=publicError(new AppError('LIMIT','errorUsageLimit'));
  for(const locale of Object.keys(catalogs))assert.equal(errorText(error,locale),catalogs[locale].errorUsageLimit);
  assert.equal(errorText({message:'private server response'},'en'),catalogs.en.errorUnexpected);
  assert.equal(publicError(new Error('sensitive internal detail')).message,catalogs.en.errorUnexpected);
});
test('all internal AppError message keys exist and source UI text is marked',async()=>{
  for(const dir of ['native','extension','shared'])for(const name of await readdir(new URL(`../src/${dir}/`,import.meta.url))){
    if(!name.endsWith('.js'))continue;const source=await readFile(new URL(`../src/${dir}/${name}`,import.meta.url),'utf8');
    for(const m of source.matchAll(/['"](error[A-Z]\w+)['"]/g))assert.ok(keys.includes(m[1]),`${name}: ${m[1]}`);
  }
  const doc=new JSDOM(await readFile(new URL('../src/extension/ui.html',import.meta.url),'utf8')).window.document;
  for(const el of doc.querySelectorAll('[data-i18n]'))assert.ok(keys.includes(el.dataset.i18n));
  for(const el of doc.querySelectorAll('button,label,h1,h2,h3,option,p,li,title,a'))assert.ok(el.dataset.i18n || el.id==='openSettings',el.outerHTML);
});
test('build has Chrome locale metadata, stable ID and unchanged permission scope',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../dist/extension/manifest.json',import.meta.url)));
  assert.equal(manifest.default_locale,'en');assert.equal(manifest.name,'__MSG_appName__');
  assert.deepEqual(manifest.permissions,['activeTab','scripting','storage','nativeMessaging','contextMenus']);
  assert.equal(manifest.host_permissions,undefined);
  for(const locale of ['en','zh_CN','zh_TW']){
    const messages=JSON.parse(await readFile(new URL(`../dist/extension/_locales/${locale}/messages.json`,import.meta.url)));
    assert.deepEqual(Object.keys(messages).sort(),keys);
    for(const name of ['appName','extensionDescription','actionTitle','commandToggle'])assert.ok(messages[name].message);
  }
});
const html=await readFile(new URL('../dist/extension/options.html',import.meta.url),'utf8');
const bundle=await readFile(new URL('../dist/extension/ui.js',import.meta.url),'utf8');
async function ui(locale,{page='options',state='connected',welcome=false,error=null}={}){
  const dom=new JSDOM(html,{url:`https://leaf.test/${page}.html`,runScripts:'outside-only'});const {window:w}=dom;
  const requests=[];let listener;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const account={profiles:state==='signedOut'?[]:[{id:'fixture',email:'',connected:true,sharing:state==='connected'}],active:'fixture',pending:state==='pending',error};
  const settings={...DEFAULTS,target:'ja',model:'fixture'};
  w.chrome={i18n:{getUILanguage:()=>locale},tabs:{query:async()=>[{id:1}]},storage:{local:{get:async key=>key==='settings'?{settings}:{[key]:!welcome},set:async()=>{}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage:async()=>{},sendMessage:async m=>{requests.push(m);if(state==='missing')return {ok:false,error:publicError(new AppError('HOST_MISSING','errorHostMissing'))};return {ok:true,result:m.type==='state'?{account,settings}:m.type==='models'?[{id:'fixture',name:'Fixture model'}]:m.type==='pageStatus'?{active:false}:{}};}}};
  await w.eval(`(async()=>{${bundle}\n})()`);
  return {dom,document:w.document,requests,close:()=>w.close()};
}
for(const locale of Object.keys(catalogs)){
  test(`${locale}: popup/options, onboarding, connection states, errors and targets`,async()=>{
    for(const page of ['popup','options'])for(const state of ['connected','signedOut','pending','consent','missing']){
      const h=await ui(locale,{page,state,welcome:state==='connected',error:state==='consent'?publicError(new AppError('TIMEOUT','errorLoginTimeout')):null});
      try{
        const d=h.document;assert.equal(d.documentElement.lang,locale);assert.equal(d.title,catalogs[locale].appName);
        assert.equal(d.querySelector('#target').value,'ja');assert.equal(h.requests.some(m=>m.type==='settings'),false,'UI locale must not overwrite target');
        const key=state==='missing'?'hostNotReady':state==='signedOut'?'connectChatGPT':state==='pending'?'waitingLogin':state==='consent'?'consentPending':'connected';
        assert.equal(d.querySelector('#connectionLabel').textContent,catalogs[locale][key]);
        assert.equal(d.querySelector('#login').textContent,catalogs[locale].continueChatGPT);
        if(state==='connected')assert.equal(d.querySelector('#welcome').open,true);
        if(state==='consent')assert.equal(d.querySelector('#message').textContent,catalogs[locale].errorLoginTimeout);
        if(state==='missing')assert.equal(d.querySelector('#setup').hidden,false);
      }finally{h.close();}
    }
  });
  test(`${locale}: callback success and failure pages have localized text and language`,()=>{
    for(const success of [true,false]){
      const d=new JSDOM(callbackPage(locale,success)).window.document;
      assert.equal(d.documentElement.lang,locale);assert.equal(d.querySelector('h1').textContent,catalogs[locale][success?'connected':'callbackFailure']);
      assert.equal(d.querySelectorAll('script').length,0);
    }
  });
}
