async page => {
  page.setDefaultTimeout(8000);
  await page.reload();
  const evidence=[];
  const state=()=>page.evaluate(()=>({url:location.href,posts:document.querySelectorAll('article').length,translations:document.querySelectorAll('[data-leaf-root=translation]').length,status:document.querySelector('[data-leaf-root=toolbar]')?.shadowRoot.querySelector('.status').textContent}));
  const ready=()=>page.waitForFunction(()=>document.querySelector('[data-leaf-root=toolbar]') && document.querySelectorAll('[data-leaf-root=translation]').length>0);
  await ready();evidence.push({step:'initial',...await state()});
  for(let i=0;i<8;i++){await page.mouse.wheel(0,950);await page.waitForTimeout(180);}
  await page.waitForFunction(()=>document.querySelectorAll('article').length>8 && [...document.querySelectorAll('[data-leaf-root=translation]')].some(e=>/number (9|1[0-9])\./.test(e.shadowRoot.textContent)));
  evidence.push({step:'infinite-scroll-with-40ms-mutations',...await state()});
  await page.mouse.wheel(0,-100000);await page.waitForFunction(()=>scrollY<5);
  for(let version=1;version<=2;version++){
    await page.getByRole('button',{name:'Reuse first node',exact:true}).click();
    await page.waitForFunction(v=>document.querySelector('main p [data-leaf-root=translation]')?.shadowRoot.querySelector('.translation').textContent.includes(`Reused node version ${v}.`),version);
    evidence.push({step:'reused-text-'+version,...await state()});
  }
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await page.getByRole('button',{name:'Add post',exact:true}).click();
  const addedNumber=await page.locator('article').count();
  await page.mouse.wheel(0,100000);await page.waitForTimeout(750);
  if(await page.locator('article').nth(addedNumber-1).locator('[data-leaf-root=translation]').count())throw new Error('Paused feed translated a new post');
  evidence.push({step:'paused-added-post',...await state()});
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.waitForFunction(n=>document.querySelectorAll('article')[n-1]?.querySelector('[data-leaf-root=translation]'),addedNumber);
  evidence.push({step:'resumed',...await state()});
  await page.getByRole('button',{name:'Push route',exact:true}).click();await ready();
  evidence.push({step:'pushState',...await state()});
  await page.getByRole('button',{name:'Replace route',exact:true}).click();await ready();
  const replaced=page.url();evidence.push({step:'replaceState',...await state()});
  await page.goBack();await page.waitForURL('http://127.0.0.1:8765/feed.html');await ready();
  evidence.push({step:'back',...await state()});
  await page.goForward();await page.waitForURL(replaced);await ready();
  evidence.push({step:'forward',...await state()});
  await page.getByRole('link',{name:'Next document',exact:true}).click();await page.waitForURL('**/feed-next.html');await ready();
  evidence.push({step:'new-document-automatic',...await state()});
  await page.getByRole('link',{name:'Back to feed',exact:true}).click();await ready();
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await page.getByRole('link',{name:'Next document',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-leaf-root=toolbar]')?.shadowRoot.querySelector('.pause').textContent==='继续');
  if(await page.locator('[data-leaf-root=translation]').count())throw new Error('Paused navigation sent translations');
  evidence.push({step:'paused-new-document',...await state()});
  await page.getByRole('button',{name:'继续',exact:true}).click();await ready();
  await page.screenshot({path:'output/playwright/feed-navigation-success.png'});
  await page.getByRole('button',{name:'恢复原文',exact:true}).click();
  await page.getByRole('link',{name:'Back to feed',exact:true}).click();await page.waitForTimeout(750);
  if(await page.locator('[data-leaf-root]').count())throw new Error('Stopped navigation restarted translation');
  evidence.push({step:'stopped-new-document',...await state()});
  return evidence;
}
