import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
let key;try{key=JSON.parse(await readFile(join(root,'extension-key.json'),'utf8')).key;}catch(e){if(e.code!=='ENOENT')throw e;key=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'der'}).toString('base64');await writeFile(join(root,'extension-key.json'),JSON.stringify({key},null,2)+'\n');}
const id=createHash('sha256').update(Buffer.from(key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
const dist=join(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(join(dist,'extension','icons'),{recursive:true});await mkdir(join(dist,'native'),{recursive:true});
await Promise.all([
  ...['background','ui'].map(name=>build({entryPoints:[join(root,`src/extension/${name}.js`)],outfile:join(dist,`extension/${name}.js`),bundle:true,format:'esm',platform:'browser',target:'chrome120',legalComments:'eof'})),
  build({entryPoints:[join(root,'src/extension/content.js')],outfile:join(dist,'extension/content.js'),bundle:true,format:'iife',platform:'browser',target:'chrome120'}),
  build({entryPoints:[join(root,'src/native/index.js')],outfile:join(dist,'native/host.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',define:{EXTENSION_ID:JSON.stringify(id)},legalComments:'eof'})
]);
const manifest={manifest_version:3,name:'叶译 · Leaf Translate',version:'0.1.0',description:'使用官方 ChatGPT 登录与额度，在原网页中阅读双语译文。',minimum_chrome_version:'120',key,permissions:['activeTab','scripting','storage','nativeMessaging','contextMenus'],background:{service_worker:'background.js',type:'module'},action:{default_popup:'popup.html',default_title:'叶译 · 翻译当前网页'},options_page:'options.html',commands:{'toggle-translation':{suggested_key:{default:'Alt+Shift+T'},description:'翻译网页 / 恢复原文'}},icons:Object.fromEntries([16,32,48,128].map(n=>[String(n),`icons/${n}.png`])),content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'"}};
await writeFile(join(dist,'extension/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await cp(join(root,'src/extension/ui.css'),join(dist,'extension/ui.css'));for(const page of ['popup','options'])await cp(join(root,'src/extension/ui.html'),join(dist,`extension/${page}.html`));
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([len,name,data,crc]);}
for(const n of [16,32,48,128]){
  const pixels=Buffer.alloc(n*(1+n*4));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(x+.5)/n,v=(y+.5)/n;const k=y*(1+n*4)+1+x*4;
    const dx=Math.max(.23-u,0,u-.77),dy=Math.max(.23-v,0,v-.77);const inside=dx*dx+dy*dy<.23*.23;
    const leaf=((u-.38)**2+(v-.30)**2<.44**2)&&((u-.70)**2+(v-.62)**2<.44**2);
    const vein=Math.abs(u+v-1)<.025 && u>.3 && u<.69;
    const rgb=leaf&&!vein?[246,248,235]:[36,100,73];pixels[k]=rgb[0];pixels[k+1]=rgb[1];pixels[k+2]=rgb[2];pixels[k+3]=inside?255:0;
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(n);ihdr.writeUInt32BE(n,4);ihdr[8]=8;ihdr[9]=6;
  await writeFile(join(dist,`extension/icons/${n}.png`),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
await writeFile(join(dist,'extension-id.txt'),id+'\n');await cp(join(root,'node_modules/jose/LICENSE.md'),join(dist,'native/jose-LICENSE.md'));
console.log(`Built extension ${id}\nLoad unpacked: ${join(dist,'extension')}`);
