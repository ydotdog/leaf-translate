import {collectBlocks,serializeNodes,splitMarkedText,createTranslation} from './dom.js';

if(!globalThis.__leafTranslate) {
  globalThis.__leafTranslate=true;
  let runId=null,settings=null,paused=false,working=false,scanTimer=null,observer=null,intersection=null,toolbar=null,error='',generation=0;
  let records=new Map(),cache=new Map(),pageURL=location.href;
  const send=async payload=>{const response=await chrome.runtime.sendMessage(payload);if(!response?.ok)throw Object.assign(new Error(response?.error?.message || '无法连接翻译组件。'),response?.error);return response.result;};
  const status=()=>({active:Boolean(runId),paused,working,done:[...records.values()].filter(r=>r.host).length,total:records.size,error});
  function update() {
    if(!toolbar)return;const s=status();toolbar.shadowRoot.querySelector('.status').textContent=error || `${s.done} / ${s.total} 段${paused?' · 已暂停':working?' · 翻译中':' · 随阅读继续'}`;
    toolbar.shadowRoot.querySelector('.pause').textContent=paused?'继续':'暂停';
  }
  function makeToolbar() {
    toolbar=document.createElement('div');toolbar.dataset.leafRoot='toolbar';toolbar.style.cssText='position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;display:block!important;max-width:calc(100vw - 40px)!important;';
    const root=toolbar.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=':host{color-scheme:light dark}*{box-sizing:border-box}.bar{font:13px/1.5 system-ui,sans-serif;display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;border:1px solid #bed2c5;border-radius:14px;background:#f9fcf8;color:#173f32;box-shadow:0 5px 25px #0002;max-width:440px}.status{max-width:260px;overflow-wrap:anywhere}button{font:inherit;border:0;background:#e6eee7;color:inherit;padding:5px 9px;border-radius:7px;cursor:pointer}button:focus-visible{outline:2px solid #1c7857;outline-offset:2px}@media(prefers-color-scheme:dark){.bar{background:#162820;color:#e2eee5;border-color:#395b47}button{background:#2b4336}}@media print{.bar{display:none}}';
    const bar=document.createElement('div');bar.className='bar';bar.setAttribute('role','region');bar.setAttribute('aria-label','Leaf Translate');
    const label=document.createElement('span');label.className='status';label.setAttribute('role','status');label.setAttribute('aria-live','polite');
    const pause=document.createElement('button');pause.className='pause';pause.onclick=()=>{paused=!paused;if(!paused){error='';pump();}else send({type:'cancelRequests',runId}).catch(()=>{});update();};
    const restore=document.createElement('button');restore.textContent='恢复原文';restore.onclick=()=>send({type:'stopPage'}).catch(()=>stop());
    bar.append(label,pause,restore);root.append(style,bar);document.body.append(toolbar);update();
  }
  function stop() {
    generation++;runId=null;paused=false;working=false;clearTimeout(scanTimer);observer?.disconnect();intersection?.disconnect();
    for(const r of records.values())r.host?.remove();records.clear();cache.clear();toolbar?.remove();toolbar=null;error='';
  }
  function scan() {
    if(!runId)return;
    if(location.href!==pageURL){send({type:'stopPage'}).catch(()=>{});stop();return;}
    const blocks=collectBlocks(document,settings.scope);
    const seen=new Set();
    for(const block of blocks) {
      const key=block.nodes[0];seen.add(key);let old=records.get(key);
      if(old && old.text===block.text && old.nodes.at(-1)===block.nodes.at(-1) && (!old.host || old.host.isConnected))continue;
      if(old){old.host?.remove();intersection.unobserve(old.element);}
      const record={...block,key,visible:false,busy:false,host:null};records.set(key,record);intersection.observe(block.element);
      const rect=block.element.getBoundingClientRect();record.visible=rect.bottom>-400 && rect.top<innerHeight+400;
    }
    for(const [key,record] of records){if(!seen.has(key)){record.host?.remove();records.delete(key);}}
    update();pump();
  }
  function current(record,epoch){return runId && epoch===generation && records.get(record.key)===record && record.element.isConnected && serializeNodes(record.nodes).text===record.text;}
  async function pump() {
    if(working || paused || !runId)return;
    const todo=[...records.values()].filter(r=>r.visible && !r.host && !r.busy).slice(0,6);if(!todo.length)return;
    working=true;const epoch=generation;const thisRun=runId;todo.forEach(r=>r.busy=true);update();
    try {
      const tasks=[];const jobs=[];
      for(const [number,record] of todo.entries()) {
        if(!current(record,epoch) || paused)continue;
        const key=`${settings.model}:${settings.target}:${record.text}`;const cached=cache.get(key);
        if(cached){record.host=createTranslation(record,cached,settings);continue;}
        const chunks=splitMarkedText(record.text);const job={record,key,parts:Array(chunks.length).fill(null)};jobs.push(job);
        chunks.forEach((text,i)=>tasks.push({id:`p${number}_${i}`,text,job,index:i}));
      }
      while(tasks.length && epoch===generation && !paused) {
        const group=[];let size=0;
        while(tasks.length && group.length<8 && size+tasks[0].text.length<=16000){const task=tasks.shift();size+=task.text.length;group.push(task);}
        const response=await send({type:'translate',runId:thisRun,items:group.map(({id,text})=>({id,text}))});
        for(const item of response){const task=group.find(t=>t.id===item.id);if(task)task.job.parts[task.index]=item.text;}
        for(const job of jobs) {
          if(job.record.host || job.parts.some(p=>p===null) || !current(job.record,epoch) || paused)continue;
          const translated=job.parts.join('');job.record.host=createTranslation(job.record,translated,settings);
          cache.set(job.key,translated);if(cache.size>500)cache.delete(cache.keys().next().value);update();
        }
      }
    }catch(e){if(epoch===generation && e.code!=='CANCELLED'){error=e.message;paused=true;}}
    finally {todo.forEach(r=>r.busy=false);if(epoch===generation){working=false;update();if(!paused)setTimeout(pump,120);}}
  }
  function start(config) {
    stop();settings=config.settings;runId=config.runId;pageURL=location.href;
    intersection=new IntersectionObserver(entries=>{for(const entry of entries)for(const r of records.values())if(r.element===entry.target)r.visible=entry.isIntersecting;pump();},{rootMargin:'400px'});
    observer=new MutationObserver(mutations=>{
      const relevant=mutations.some(m=>!m.target.closest?.('[data-leaf-root]') && (m.type==='characterData' || m.type==='attributes' || [...m.addedNodes,...m.removedNodes].some(n=>!(n.nodeType===1 && n.hasAttribute('data-leaf-root')))));
      if(relevant){clearTimeout(scanTimer);scanTimer=setTimeout(scan,450);}
    });
    makeToolbar();scan();observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','style','class','lang']});
  }
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message.type==='leaf.start'){start(message);reply(status());}
    else if(message.type==='leaf.stop'){stop();reply(status());}
    else if(message.type==='leaf.status')reply(status());
  });
  addEventListener('pagehide',()=>{if(runId)send({type:'cancelRequests',runId}).catch(()=>{});stop();});
  addEventListener('popstate',()=>{if(runId && pageURL!==location.href){send({type:'stopPage'}).catch(()=>{});stop();}});
}
