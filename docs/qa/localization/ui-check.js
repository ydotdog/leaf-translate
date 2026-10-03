async (page) => {
  const extension='chrome-extension://hkpccpakokoliiahjeifekgadoffdpac/';
  const results=[];
  await page.context().addInitScript(()=>{
    if(location.protocol!=='chrome-extension:')return;
    const params=new URLSearchParams(location.search),locale=params.get('locale') || 'en',state=params.get('state') || 'connected';
    chrome.i18n.getUILanguage=()=>locale;
    const settings={target:'ja',model:'fixture',scope:'article',style:'subtle'};
    const account={profiles:state==='signedOut'?[]:[{id:'fixture',email:'',connected:true,sharing:state==='connected'}],active:'fixture',pending:state==='pending',error:state==='error'?{messageKey:'errorUsageLimit'}:null};
    chrome.storage.local.get=async key=>key==='settings'?{settings}:{[key]:params.get('welcome')!=='1'};
    chrome.storage.local.set=async()=>{};
    chrome.tabs.query=async()=>[{id:999999}];
    chrome.runtime.sendMessage=async m=>state==='missing'?{ok:false,error:{code:'HOST_MISSING',messageKey:'errorHostMissing'}}:{ok:true,result:m.type==='state'?{account,settings}:m.type==='models'?[{id:'fixture',name:'Fixture model'}]:m.type==='pageStatus'?{active:false}:{}};
  });
  for(const locale of ['en','zh-CN','zh-TW','fr']){
    for(const type of ['popup','options']){
      await page.setViewportSize(type==='popup'?{width:372,height:600}:{width:1100,height:1000});
      await page.goto(extension+type+'.html?locale='+locale+'&state=connected');
      await page.waitForFunction(()=>document.querySelector('#model').value==='fixture');
      const result=await page.evaluate(()=>({lang:document.documentElement.lang,title:document.title,connection:document.querySelector('#connectionLabel').textContent,target:document.querySelector('#target').value,width:document.documentElement.scrollWidth,viewport:innerWidth,height:document.body.scrollHeight,button:document.querySelector('#translate').getBoundingClientRect().toJSON(),settingsTitle:document.querySelector('#openSettings').title}));
      if(result.lang!==(locale==='fr'?'en':locale) || result.target!=='ja' || result.width>result.viewport)throw Error(JSON.stringify(result));
      if(type==='popup' && result.button.bottom>600)throw Error('Popup primary action exceeds 600px: '+JSON.stringify(result));
      results.push({locale,type,...result});
      if(locale!=='fr')await page.screenshot({path:'output/playwright/i18n-'+locale+'-'+type+'.png',fullPage:true});
    }
    for(const state of ['signedOut','pending','error','missing']){
      await page.goto(extension+'options.html?locale='+locale+'&state='+state);
      results.push({locale,state,...await page.evaluate(()=>({connection:document.querySelector('#connectionLabel').textContent,message:document.querySelector('#message').textContent,setupVisible:!document.querySelector('#setup').hidden}))});
    }
    await page.goto(extension+'options.html?locale='+locale+'&state=connected&welcome=1');
    await page.locator('#welcome[open]').waitFor();
    results.push({locale,dialog:await page.locator('#welcome h2').textContent()});
    if(locale!=='fr')await page.screenshot({path:'output/playwright/i18n-'+locale+'-welcome.png'});
  }
  return results;
}
