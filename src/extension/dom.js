const EXCLUDE='script,style,noscript,pre,textarea,input,select,button,svg,math,canvas,iframe,video,audio,.katex,.MathJax,[role="math"],[contenteditable]:not([contenteditable="false"]),[translate="no"],.notranslate,[aria-hidden="true"],[hidden],[data-leaf-root],[role="textbox"],[role="button"],[role="menu"],[role="navigation"],nav';
const BLOCK_TAGS=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','LI','TD','TH','DT','DD','BLOCKQUOTE','FIGCAPTION','CAPTION','ARTICLE','MAIN','SECTION','ASIDE','HEADER','FOOTER','BODY']);
const INLINE=new Set(['A','EM','STRONG','B','I','U','S','SMALL','SUB','SUP','MARK','ABBR','SPAN','BR','CODE','KBD','SAMP']);
const BLOCK_DISPLAY=new Set(['block','list-item','table-cell','flow-root','flex','grid']);
export function excluded(element) {return !element || Boolean(element.closest(EXCLUDE));}
function visible(element) {
  for(let el=element;el;el=el.parentElement){const s=el.ownerDocument.defaultView.getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.contentVisibility==='hidden')return false;}
  return true;
}
function ownerOf(node,root) {
  let element=node.parentElement;
  while(element){
    const display=element.ownerDocument.defaultView.getComputedStyle(element).display;
    if(['flex','inline-flex','grid','inline-grid'].includes(display)) {
      // Keep translations inside existing layout items. Raw text has no safe item
      // container, so leave it alone rather than adding a new flex/grid child.
      if(node.parentElement===element)return null;
      let item=node.parentElement;while(item.parentElement!==element)item=item.parentElement;return item;
    }
    if(element===root || BLOCK_TAGS.has(element.tagName)||BLOCK_DISPLAY.has(display))return element;
    element=element.parentElement;
  }
  return element;
}
export function serializeNodes(nodes) {
  const tags=new Map();let index=0;
  function visit(node) {
    if(node.nodeType===3)return node.textContent.replace(/⟦/g,'【').replace(/⟧/g,'】');
    if(node.nodeType!==1 || excluded(node))return '';
    if(node.tagName==='BR')return '\n';
    const text=[...node.childNodes].map(visit).join('');if(!text)return '';
    if(!INLINE.has(node.tagName) || node.tagName==='SPAN')return text;
    const id=String(index++);const template={tag:node.tagName.toLowerCase()};
    if(['CODE','KBD','SAMP'].includes(node.tagName))template.locked=node.textContent;
    if(node.tagName==='A') {
      try {const url=new URL(node.getAttribute('href'),node.baseURI);if(['http:','https:','mailto:','tel:'].includes(url.protocol))template.href=url.href;}catch{}
    }
    tags.set(id,template);return `⟦${id}⟧${template.locked===undefined?text:''}⟦/${id}⟧`;
  }
  const text=nodes.map(visit).join('').replace(/[ \t]+/g,' ').trim();return {text,tags};
}
export function collectBlocks(document,scope='article',limit=3000) {
  const root=(scope==='article' && ([...document.querySelectorAll('article')].find(visible) || [...document.querySelectorAll('main,[role="main"]')].find(visible))) || document.body;
  if(!root)return [];
  const walker=document.createTreeWalker(root,4);const owners=new Map();let node,count=0;
  while((node=walker.nextNode()) && count<120000) {
    count++;if(!node.textContent.trim() || excluded(node.parentElement))continue;
    const owner=ownerOf(node,root);if(!owner || !visible(owner))continue;
    let direct=node;while(direct.parentNode!==owner && direct.parentNode)direct=direct.parentNode;
    if(!owners.has(owner))owners.set(owner,new Set());owners.get(owner).add(direct);
    if(owners.size>limit)break;
  }
  const blocks=[];
  for(const [element,eligible] of owners) {
    let run=[];
    const flush=()=>{if(!run.length)return;const data=serializeNodes(run);if(data.text.replace(/⟦\/?\d+⟧/g,'').match(/\p{L}/u))blocks.push({element,nodes:run,...data});run=[];};
    for(const child of element.childNodes){if(eligible.has(child) || (child.nodeType===3 && !child.textContent.trim() && run.length))run.push(child);else if(child.nodeType===1 && child.hasAttribute('data-leaf-root'))continue;else flush();}
    flush();if(blocks.length>=limit)break;
  }
  return blocks.slice(0,limit);
}
export function splitMarkedText(text,max=4800) {
  if(text.length<=max)return [text];
  const pieces=text.split(/(⟦\/?\d+⟧)/g);const stack=[];const output=[];let current='';let size=0;
  const flush=()=>{if(!size)return;output.push(current+[...stack].reverse().map(id=>`⟦/${id}⟧`).join(''));current=stack.map(id=>`⟦${id}⟧`).join('');size=0;};
  for(const piece of pieces) {
    const marker=/^⟦(\/?)(\d+)⟧$/.exec(piece);
    if(marker){if(current.length+piece.length+stack.join('').length+stack.length*4>max && size)flush();current+=piece;if(marker[1]){if(stack.pop()!==marker[2])throw new Error('Invalid source markers');}else stack.push(marker[2]);continue;}
    for(const char of piece){current+=char;size+=char.length;const used=current.length+stack.join('').length+stack.length*4;if((used>max-500 && /[\s。！？.!?]/u.test(char)) || used>=max)flush();}
  }
  flush();return output;
}
export function renderTranslation(document,text,tags) {
  const fragment=document.createDocumentFragment();const stack=[{id:null,node:fragment}];
  for(const piece of text.split(/(⟦\/?\d+⟧)/g)) {
    const marker=/^⟦(\/?)(\d+)⟧$/.exec(piece);
    if(!marker){stack.at(-1).node.append(document.createTextNode(piece));continue;}
    if(marker[1]){if(stack.length===1)throw new Error('Invalid translation markers');const closed=stack.pop();if(closed.id!==marker[2])throw new Error('Invalid translation markers');if(closed.locked!==undefined)closed.node.textContent=closed.locked;}
    else {
      const template=tags.get(marker[2]);if(!template)throw new Error('Unknown translation marker');
      const element=document.createElement(template.tag);
      if(template.href){element.href=template.href;element.rel='noopener noreferrer';}
      stack.at(-1).node.append(element);stack.push({id:marker[2],node:element,locked:template.locked});
    }
  }
  if(stack.length!==1)throw new Error('Unclosed translation markers');return fragment;
}
export function createTranslation(block,text,{target,style='subtle'}) {
  const document=block.element.ownerDocument;const host=document.createElement('span');
  host.dataset.leafRoot='translation';host.lang=target;host.dir=target==='ar'?'rtl':'auto';
  host.style.cssText='display:block!important;position:static!important;box-sizing:border-box!important;max-width:100%!important;min-width:0!important;white-space:normal!important;overflow-wrap:anywhere!important;margin:.45em 0 .65em!important;padding:0!important;font:inherit!important;color:inherit!important;text-align:start!important;';
  const shadow=host.attachShadow({mode:'open'});const css=document.createElement('style');
  css.textContent=':host{color-scheme:light dark}.translation{display:block;font:inherit;line-height:1.65;overflow-wrap:anywhere;white-space:pre-wrap;text-align:start;border-inline-start:2px solid color-mix(in srgb,currentColor 24%,transparent);padding-inline-start:.7em}a{color:inherit;text-decoration:underline;text-underline-offset:.18em}strong,b{font-weight:700}sub,sup{font-size:.75em}mark{background:color-mix(in srgb,#c5bf4c 30%,transparent);color:inherit}:host([data-style="plain"]) .translation{border:0;padding:0}';
  host.dataset.style=style;
  const content=document.createElement('span');content.className='translation';content.append(renderTranslation(document,text,block.tags));shadow.append(css,content);
  const last=block.nodes.at(-1);last.after(host);return host;
}
