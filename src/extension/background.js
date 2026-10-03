import {t,uiLocale} from '../shared/i18n.js';
import {HOST,DEFAULTS,LANGUAGES,AppError,publicError,validateBatch} from '../shared/protocol.js';
let port=null;
const pending=new Map();
const sessions=new Map();
const navigationAttempts=new Map();
const restoring=chrome.storage.session.get('sessions').then(({sessions:saved=[]})=>{for(const [id,s] of saved)sessions.set(id,s);});
const persist=()=>chrome.storage.session.set({sessions:[...sessions]});
function connect() {
  if(port)return port;
  port=chrome.runtime.connectNative(HOST);
  port.onMessage.addListener(message=>{
    if(message.event==='accountChanged'){stopAll();chrome.runtime.sendMessage({event:'accountChanged'}).catch(()=>{});return;}
    const task=pending.get(message.id);if(!task)return;clearTimeout(task.timer);pending.delete(message.id);
    if(message.ok)task.resolve(message.result);else task.reject(Object.assign(new AppError(message.error?.code || 'NATIVE',message.error?.messageKey || 'errorNative'),{details:message.error?.details}));
  });
  port.onDisconnect.addListener(()=>{
    const missing=Boolean(chrome.runtime.lastError);port=null;
    for(const task of pending.values()){clearTimeout(task.timer);task.reject(new AppError('HOST_MISSING',missing?'errorHostMissing':'errorHostDisconnected'));}pending.clear();
  });return port;
}
function native(method,params={},tabId=null) {
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const p=connect();const timer=setTimeout(()=>{pending.delete(id);try{p.postMessage({id:crypto.randomUUID(),method:'cancel',params:{requestId:id}});}catch{}reject(new AppError('TIMEOUT','errorTimeout'));},140000);
    pending.set(id,{resolve,reject,timer,tabId});p.postMessage({id,method,params});
  });
}
function cancel(tabId) {for(const [id,task] of pending){if(task.tabId===tabId){try{port?.postMessage({id:crypto.randomUUID(),method:'cancel',params:{requestId:id}});}catch{}clearTimeout(task.timer);task.reject(new AppError('CANCELLED','errorStopped'));pending.delete(id);}}}
async function stop(tabId) {navigationAttempts.delete(tabId);cancel(tabId);sessions.delete(tabId);await persist();await chrome.action.setBadgeText({tabId,text:''}).catch(()=>{});await chrome.tabs.sendMessage(tabId,{type:'leaf.stop'}).catch(()=>{});}
async function stopAll(){await restoring;await Promise.all([...sessions.keys()].map(stop));}
async function settings(){return {...DEFAULTS,...(await chrome.storage.local.get('settings')).settings};}
function origin(url){try{const parsed=new URL(url);return /^https?:$/.test(parsed.protocol)?parsed.origin:null;}catch{return null;}}
async function continuePage(tabId) {
  const session=sessions.get(tabId);if(!session)return;
  const attempt={};navigationAttempts.set(tabId,attempt);
  const current=()=>sessions.get(tabId)===session && navigationAttempts.get(tabId)===attempt;
  try {
    const tab=await chrome.tabs.get(tabId);if(!current())return;
    if(!origin(tab.url) || origin(tab.url)!==(session.origin || origin(session.url))){await stop(tabId);return;}
    if(tab.status==='loading')return;
    const injected=await chrome.scripting.executeScript({target:{tabId},files:['content.js']});if(!current())return;
    const documentId=injected[0]?.documentId;
    const latest=await chrome.tabs.get(tabId);if(!current())return;
    if(latest.url!==tab.url || latest.status==='loading')return;
    if(!documentId)throw new Error('Missing document');
    if(session.documentId===documentId && session.url===tab.url && !session.needsResume)return;
    cancel(tabId);
    session.runId=crypto.randomUUID();session.documentId=documentId;session.url=tab.url;session.needsResume=true;
    await persist();if(!current())return;
    await chrome.tabs.sendMessage(tabId,{type:'leaf.start',runId:session.runId,settings:session.settings,paused:Boolean(session.paused)},{documentId});
    if(current()){session.needsResume=false;await persist();}
  }catch {if(current())await stop(tabId);}
  finally{if(navigationAttempts.get(tabId)===attempt)navigationAttempts.delete(tabId);}
}
async function startPage(tabId) {
  await restoring;const tab=await chrome.tabs.get(tabId);
  if(!tab.url || !/^https?:/.test(tab.url) || /^https:\/\/chromewebstore\.google\.com\//.test(tab.url))throw new AppError('UNSUPPORTED_PAGE','errorUnsupportedPage');
  const account=await native('status');const profile=account.profiles.find(p=>p.id===account.active);
  if(!profile?.sharing)throw new AppError('LOGIN_REQUIRED','errorLoginPlan');
  const config=await settings();if(!config.model)throw new AppError('MODEL_REQUIRED','errorModelRequired');
  await stop(tabId);
  let injected;try{injected=await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}catch{throw new AppError('UNSUPPORTED_PAGE','errorPageAccess');}
  const runId=crypto.randomUUID();sessions.set(tabId,{runId,documentId:injected[0].documentId,url:tab.url,origin:origin(tab.url),settings:config,paused:false});await persist();
  try{await chrome.tabs.sendMessage(tabId,{type:'leaf.start',runId,settings:config},{documentId:injected[0].documentId});}catch{await stop(tabId);throw new AppError('PAGE_CHANGED','errorPageChanged');}
  await chrome.action.setBadgeBackgroundColor({tabId,color:'#246449'});await chrome.action.setBadgeText({tabId,text:t('badge')});return {started:true};
}
async function handler(message,sender) {
  await restoring;
  if(sender.id!==chrome.runtime.id)throw new AppError('DENIED','errorDenied');
  const isUI=!sender.tab && [chrome.runtime.getURL('popup.html'),chrome.runtime.getURL('options.html')].some(url=>sender.url?.split('?')[0]===url);
  // Extension pages opened in a tab carry sender.tab too.
  const trustedUI=isUI || [chrome.runtime.getURL('popup.html'),chrome.runtime.getURL('options.html')].some(url=>sender.url?.split('?')[0]===url);
  if(!trustedUI){
    const tabId=sender.tab?.id;const session=sessions.get(tabId);
    if(!session || session.documentId!==sender.documentId || (message.runId && session.runId!==message.runId))throw new AppError('CANCELLED','errorSessionEnded');
    if(message.type==='translate')return native('translate',validateBatch({...session.settings,items:message.items}),tabId);
    if(message.type==='cancelRequests'){cancel(tabId);return {cancelled:true};}
    if(message.type==='pausePage'){session.paused=Boolean(message.paused);if(session.paused)cancel(tabId);await persist();return {paused:session.paused};}
    if(message.type==='navigatePage'){await continuePage(tabId);return {continued:sessions.has(tabId)};}
    if(message.type==='stopPage'){await stop(tabId);return {stopped:true};}
    throw new AppError('DENIED','errorPageMethod');
  }
  switch(message.type){
    case 'state':return {settings:await settings(),account:await native('status')};
    case 'models':return native('models');
    case 'login':await stopAll();return native('login',{profileId:message.profileId,consent:Boolean(message.consent),locale:uiLocale()});
    case 'cancelLogin':return native('cancelLogin');
    case 'selectAccount':await stopAll();return native('select',{profileId:message.profileId});
    case 'logout':await stopAll();return native('logout');
    case 'settings':{
      const old=await settings();const next={...old,...message.settings};
      if(!Object.hasOwn(LANGUAGES,next.target) || !['article','page'].includes(next.scope) || !['subtle','plain'].includes(next.style) || typeof next.model!=='string' || next.model.length>100)throw new AppError('SETTINGS','errorSettings');
      await chrome.storage.local.set({settings:next});return next;
    }
    case 'startPage':return startPage(message.tabId);
    case 'stopPage':await stop(message.tabId);return {stopped:true};
    case 'pageStatus':return (await chrome.tabs.sendMessage(message.tabId,{type:'leaf.status'}).catch(()=>null)) || {active:false};
    default:throw new AppError('METHOD','errorMethod');
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.event)return false;
  handler(message,sender).then(result=>reply({ok:true,result})).catch(error=>reply({ok:false,error:publicError(error)}));return true;
});
function updateMenus(){
  chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'leaf-toggle',title:t('contextToggle'),contexts:['page'],documentUrlPatterns:['http://*/*','https://*/*']}));
}
chrome.runtime.onInstalled.addListener(updateMenus);
chrome.runtime.onStartup?.addListener(updateMenus);
async function toggle(tab){if(!tab?.id)return;try{if(sessions.has(tab.id))await stop(tab.id);else await startPage(tab.id);}catch{await chrome.runtime.openOptionsPage();}}
chrome.contextMenus.onClicked.addListener((info,tab)=>{if(info.menuItemId==='leaf-toggle')toggle(tab);});
chrome.commands.onCommand.addListener(async command=>{if(command==='toggle-translation'){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});toggle(tab);}});
chrome.tabs.onRemoved.addListener(tabId=>{navigationAttempts.delete(tabId);cancel(tabId);sessions.delete(tabId);persist();});
chrome.tabs.onUpdated.addListener(async(tabId,change,tab)=>{
  await restoring;const session=sessions.get(tabId);if(!session)return;
  const url=change.url || tab?.url;
  // activeTab survives same-origin navigation only. Never turn tab consent into
  // persistent access to a different site, or request broader host permissions.
  if(url && origin(url)!==(session.origin || origin(session.url))){await stop(tabId);return;}
  if(change.status==='loading'){
    navigationAttempts.delete(tabId);cancel(tabId);session.documentId=null;session.needsResume=true;await persist();return;
  }
  if(change.url || change.status==='complete')await continuePage(tabId);
});
