import {mkdir,writeFile,readFile,cp,chmod,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const name='com.leaf_translate.host';
if(!['darwin','linux'].includes(process.platform))throw new Error('此安装器目前支持 macOS / Linux。');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('需要 Node.js 22 或更新版本。');
const args=process.argv.slice(2);const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const dataDir=option('--data-dir')?resolve(option('--data-dir')):process.platform==='darwin'?join(homedir(),'Library','Application Support','Leaf Translate'):join(homedir(),'.config','leaf-translate');
const profile=option('--profile-dir');
const manifestDirs=profile?[join(resolve(profile),'NativeMessagingHosts')]:process.platform==='darwin'?[join(homedir(),'Library','Application Support','Google','Chrome','NativeMessagingHosts')]:[join(homedir(),'.config','google-chrome','NativeMessagingHosts')];
if(args.includes('--uninstall')){
  for(const directory of manifestDirs)await rm(join(directory,`${name}.json`),{force:true});
  for(const filename of ['host.mjs','launch-host','jose-LICENSE.md'])await rm(join(dataDir,filename),{force:true});
  console.log('已移除连接组件。登录信息保留在应用数据目录；删除前建议在插件中退出并在 ChatGPT 设置断开授权。');
}else{
  const extensionId=(await readFile(join(root,'dist/extension-id.txt'),'utf8')).trim();
  if(!/^[a-p]{32}$/.test(extensionId))throw new Error('无效的扩展 ID，请先构建。');
  await mkdir(dataDir,{recursive:true,mode:0o700});await chmod(dataDir,0o700);
  await cp(join(root,'dist/native/host.mjs'),join(dataDir,'host.mjs'));await cp(join(root,'dist/native/jose-LICENSE.md'),join(dataDir,'jose-LICENSE.md'));
  const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
  const launcher=join(dataDir,'launch-host');
  await writeFile(launcher,`#!/bin/sh\nexport LEAF_TRANSLATE_DATA_DIR=${quote(dataDir)}\nexec ${quote(process.execPath)} ${quote(join(dataDir,'host.mjs'))} "$@"\n`,{mode:0o700});await chmod(launcher,0o700);
  for(const directory of manifestDirs){await mkdir(directory,{recursive:true});await writeFile(join(directory,`${name}.json`),JSON.stringify({name,description:'Leaf Translate official ChatGPT connection',path:launcher,type:'stdio',allowed_origins:[`chrome-extension://${extensionId}/`]},null,2)+'\n');}
  console.log(`连接组件已安装。\n扩展 ID：${extensionId}\n在 Chrome 中加载此文件夹：${join(root,'dist','extension')}\n然后点击叶译的 Continue with ChatGPT 完成官方授权。`);
}
