import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {collectBlocks,serializeNodes,splitMarkedText,renderTranslation,createTranslation} from '../src/extension/dom.js';
const doc=body=>new JSDOM('<!doctype html><body>'+body+'</body>',{url:'https://example.org/article'}).window.document;

test('keeps paragraph semantics, links, emphasis, table cells and nested lists without duplicate text',()=>{
  const document=doc('<nav>Navigation</nav><article><h1>A title</h1><p>Hello <a href="/learn"><strong>reader</strong></a>.</p><ul><li>Parent item<ul><li>Child item</li></ul></li></ul><table><tr><td>First cell</td><td>Second cell</td></tr></table></article>');
  const blocks=collectBlocks(document);assert.equal(blocks.length,6);assert.equal(blocks.filter(b=>b.text==='Parent item').length,1);assert.equal(blocks.filter(b=>b.text==='Child item').length,1);
  const p=blocks.find(b=>b.element.tagName==='P');const translated=renderTranslation(document,p.text,p.tags);assert.equal(translated.querySelector('a').href,'https://example.org/learn');assert.equal(translated.querySelector('strong').textContent,'reader');
});
test('skips editable content, hidden ancestors, code, opt-outs and controls',()=>{
  const document=doc('<article><p>Readable text</p><div hidden><p>Secret</p></div><div style="display:none"><p>Also hidden</p></div><pre>code</pre><textarea>private draft</textarea><div contenteditable><p>Draft</p></div><p translate="no">No translation</p><p class="notranslate">Excluded</p><button>Pay now</button></article>');
  assert.deepEqual(collectBlocks(document).map(x=>x.text),['Readable text']);
});
test('inserts inside list items and table cells; restoration preserves original node identity and listeners',()=>{
  const document=doc('<article><ul><li>Hello <a href="/ok">world</a></li></ul><table><tr><td>Cell text</td></tr></table></article>');
  const initial=document.body.innerHTML;const anchor=document.querySelector('a');let clicks=0;anchor.addEventListener('click',e=>{e.preventDefault();clicks++;});
  const blocks=collectBlocks(document);const hosts=blocks.map(b=>createTranslation(b,b.text,{target:'zh-CN'}));assert.equal(hosts[0].parentElement.tagName,'LI');assert.equal(hosts[1].parentElement.tagName,'TD');assert.equal(collectBlocks(document).length,2);hosts.forEach(h=>h.remove());assert.equal(document.body.innerHTML,initial);assert.equal(document.querySelector('a'),anchor);anchor.click();assert.equal(clicks,1);
});
test('model HTML is rendered as inert text, unsafe source href is dropped, bad markers fail closed',()=>{
  const document=doc('<p><a href="javascript:alert(1)">Click here</a></p>');const b=collectBlocks(document)[0];const fragment=renderTranslation(document,'<img src=x onerror=alert(1)> ⟦0⟧文本⟦/0⟧',b.tags);assert.equal(fragment.querySelector('img'),null);assert.equal(fragment.querySelector('a').hasAttribute('href'),false);assert.throws(()=>renderTranslation(document,'⟦99⟧x⟦/99⟧',b.tags));assert.throws(()=>renderTranslation(document,'⟦0⟧x',b.tags));
});
test('long rich text splits into independently balanced chunks without text loss',()=>{
  const source='Start ⟦1⟧'+('😀 Long sentence with words. '.repeat(1000))+'⟦/1⟧ end.';const parts=splitMarkedText(source);const document=doc('');for(const p of parts){assert.ok(p.length<=5000);renderTranslation(document,p,new Map([['1',{tag:'strong'}]]));}assert.equal(parts.join('').replace(/⟦\/?\d+⟧/g,''),source.replace(/⟦\/?\d+⟧/g,''));
});
test('dynamic replacement yields fresh source and does not translate injected content',()=>{
  const document=doc('<article><p>Before update</p></article>');const first=collectBlocks(document)[0];createTranslation(first,'翻译',{target:'zh-CN'});document.querySelector('p').firstChild.textContent='After update';const next=collectBlocks(document);assert.equal(next.length,1);assert.equal(next[0].text,'After update');const newP=document.createElement('p');newP.textContent='Loaded later';document.querySelector('article').append(newP);assert.equal(collectBlocks(document).length,2);
});
test('full page mode includes sidebar content while article mode isolates the article',()=>{
  const document=doc('<aside><p>Related story</p></aside><article><p>Main story</p></article>');assert.equal(collectBlocks(document,'article').length,1);assert.equal(collectBlocks(document,'page').length,2);
});

test('reading scope covers a main feed, including later articles, but excludes the sidebar',()=>{
  const document=doc('<aside><article><p>Sidebar story</p></article></aside><main><article><p>First post</p></article></main>');
  assert.deepEqual(collectBlocks(document).map(b=>b.text),['First post']);
  document.querySelector('main').insertAdjacentHTML('beforeend','<article><p>Later post</p></article>');
  assert.deepEqual(collectBlocks(document).map(b=>b.text),['First post','Later post']);
});

test('multiple sibling articles without main are all in reading scope',()=>{
  const document=doc('<article><p>First post</p></article><article><p>Second post</p></article>');
  assert.deepEqual(collectBlocks(document).map(b=>b.text),['First post','Second post']);
});

test('inline code stays byte-for-byte intact even if a model changes its text',()=>{
  const document=doc('<p>Call <code>reader.restore()</code> now.</p>');const b=collectBlocks(document)[0];const fragment=renderTranslation(document,'调用 ⟦0⟧模型修改的代码⟦/0⟧。',b.tags);assert.equal(fragment.querySelector('code').textContent,'reader.restore()');
});

test('flex/grid text stays inside an existing item and never adds a competing layout item',()=>{
  const document=doc('<article><div style="display:flex"><span>Hello reader</span><span>Second item</span></div><div style="display:grid">Raw grid text</div></article>');const container=document.querySelector('div');const blocks=collectBlocks(document);assert.equal(blocks.length,2);for(const b of blocks)createTranslation(b,b.text,{target:'zh-CN'});assert.equal(container.children.length,2);assert.equal(container.querySelectorAll(':scope > [data-leaf-root]').length,0);
});
test('rich paragraphs with many tiny markers still split below the transport bound',()=>{
  const text=Array.from({length:1200},(_,i)=>`⟦${i}⟧word ⟦/${i}⟧`).join('');for(const chunk of splitMarkedText(text))assert.ok(chunk.length<6000);
});
