import {t,errorText,localizeDocument} from '../shared/i18n.js';
localizeDocument(document);
import {DEFAULTS,LANGUAGES} from '../shared/protocol.js';
const $=id=>document.getElementById(id);
const options=location.pathname.endsWith('options.html');
if(options){document.body.classList.add('options');$('guide').hidden=false;}
let tabId=null,account=null,config={...DEFAULTS},poll=null,modelAccount=null,models=[],loading=false;
const rpc=async message=>{const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw Object.assign(new Error(response?.error?.message || t('errorConnection')),response?.error);return response.result;};
const showMessage=message=>{$('message').textContent=message || '';$('message').hidden=!message;};
const action=fn=>async()=>{try{showMessage('');await fn();}catch(e){showMessage(errorText(e));}};
for(const [value,label] of Object.entries(LANGUAGES))$('target').add(new Option(label,value));
async function loadModels(profile){
  if(!profile?.sharing){models=[];modelAccount=null;return;}
  if(modelAccount===profile.id)return;
  models=await rpc({type:'models'});modelAccount=profile.id;
  $('model').replaceChildren();for(const model of models)$('model').add(new Option(model.name,model.id));
  if(!models.length){$('model').add(new Option(t('noModels'),''));throw Object.assign(new Error(t('errorNoModels')),{messageKey:'errorNoModels'});}
  if(!models.some(m=>m.id===config.model)){config.model=models[0].id;await rpc({type:'settings',settings:config});}
  $('model').value=config.model;
}
async function refresh(){
  if(loading)return;loading=true;
  try{
    const state=await rpc({type:'state'});account=state.account;config={...DEFAULTS,...state.settings};$('setup').hidden=true;
    const profile=account.profiles.find(p=>p.id===account.active);
    $('connectionDot').classList.toggle('connected',Boolean(profile?.sharing));
    $('connectionLabel').textContent=account.pending?t('waitingLogin'):profile?.sharing?t('connected'):profile?.connected?t('consentPending'):t('connectChatGPT');
    $('accountDetail').textContent=profile?.sharing?t('usingPlan'):profile?.connected?t('allowPlan'):t('noApiKey');
    $('login').hidden=Boolean(profile?.connected || account.pending);
    $('accountControls').hidden=!account.profiles.length;
    $('account').replaceChildren();for(const p of account.profiles)$('account').add(new Option(p.email?`${p.email} · ${p.id.slice(-6)}`:`${t('account')} · ${p.id.slice(-6)}`,p.id));$('account').value=account.active || account.profiles[0]?.id || '';
    $('addAccount').hidden=!account.profiles.length || account.pending;$('reconnect').hidden=!profile || account.pending;
    $('logout').hidden=!profile?.connected || account.pending;$('enablePlan').hidden=!profile?.connected || profile.sharing || account.pending;
    $('cancelLogin').hidden=!account.pending;
    for(const key of ['target','scope','style'])$(key).value=config[key];
    if(account.error)showMessage(errorText(account.error));
    await loadModels(profile);$('model').disabled=!profile?.sharing || !models.length;
    $('translate').disabled=!profile?.sharing || !config.model || !tabId || account.pending;
    if(profile?.sharing){
      const key=`welcome:${profile.id}`;const saved=await chrome.storage.local.get(key);
      if(!saved[key] && !$('welcome').open){$('welcome').showModal();$('acknowledge').onclick=async()=>{await chrome.storage.local.set({[key]:true});$('welcome').close();};}
    }
    clearTimeout(poll);if(account.pending)poll=setTimeout(refresh,1800);
    if(tabId){const page=await rpc({type:'pageStatus',tabId}) || {active:false};$('restore').hidden=!page.active;$('translate').textContent=page.active?t('retranslate'):t('translate');if(page.error)showMessage(page.error);}
  }catch(e){
    $('translate').disabled=true;
    if(e.code==='HOST_MISSING'){$('setup').hidden=false;$('connectionLabel').textContent=t('hostNotReady');$('accountDetail').textContent=t('hostInstallHint');$('login').hidden=true;}
    else showMessage(errorText(e));
  }finally{loading=false;}
}
$('openSettings').onclick=()=>chrome.runtime.openOptionsPage();
$('retry').onclick=action(refresh);
$('login').onclick=action(async()=>{if(!options){await chrome.runtime.openOptionsPage();return;}await rpc({type:'login',profileId:account?.active || undefined});await refresh();});
$('addAccount').onclick=action(async()=>{if(!options){await chrome.runtime.openOptionsPage();return;}await rpc({type:'login'});modelAccount=null;await refresh();});
$('reconnect').onclick=action(async()=>{await rpc({type:'login',profileId:$('account').value});modelAccount=null;await refresh();});
$('enablePlan').onclick=action(async()=>{await rpc({type:'login',profileId:account.active,consent:true});modelAccount=null;await refresh();});
$('cancelLogin').onclick=action(async()=>{await rpc({type:'cancelLogin'});await refresh();});
$('account').onchange=action(async()=>{await rpc({type:'selectAccount',profileId:$('account').value});modelAccount=null;await refresh();});
$('logout').onclick=action(async()=>{const result=await rpc({type:'logout'});modelAccount=null;models=[];$('model').replaceChildren(new Option(t('modelsConnect'),''));await refresh();if(!result.revoked)showMessage(t('logoutUnconfirmed'));});
for(const key of ['target','scope','style','model'])$(key).onchange=action(async()=>{config[key]=$(key).value;await rpc({type:'settings',settings:config});});
$('translate').onclick=action(async()=>{$('translate').disabled=true;try{await rpc({type:'startPage',tabId});window.close();}finally{$('translate').disabled=false;}});
$('restore').onclick=action(async()=>{await rpc({type:'stopPage',tabId});await refresh();});
chrome.runtime.onMessage.addListener(message=>{if(message.event==='accountChanged'){modelAccount=null;refresh();}});
if(!options){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;}
config={...DEFAULTS,...(await chrome.storage.local.get('settings')).settings};for(const key of ['target','scope','style'])$(key).value=config[key];
await refresh();
