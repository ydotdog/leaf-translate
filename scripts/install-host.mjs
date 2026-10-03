import {mkdir,writeFile,readFile,cp,chmod,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const name='com.leaf_translate.host';
if(!['darwin','linux'].includes(process.platform))throw new Error('This installer supports macOS and Linux.');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or newer is required.');
const args=process.argv.slice(2);const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const browser=option('--browser') || 'chrome';
if(!['chrome','dia','all'].includes(browser))throw new Error('--browser must be chrome, dia or all.');
if(process.platform!=='darwin' && browser!=='chrome')throw new Error('Dia installation is supported on macOS only.');
const dataDir=option('--data-dir')?resolve(option('--data-dir')):process.platform==='darwin'?join(homedir(),'Library','Application Support','Leaf Translate'):join(homedir(),'.config','leaf-translate');
const profile=option('--profile-dir');
const manifestDirs=profile?[join(resolve(profile),'NativeMessagingHosts')]:process.platform==='darwin'?[
  ...(browser==='chrome'||browser==='all'?[join(homedir(),'Library','Application Support','Google','Chrome','NativeMessagingHosts')]:[]),
  ...(browser==='dia'||browser==='all'?[join(homedir(),'Library','Application Support','Dia','User Data','NativeMessagingHosts')]:[])
]:[join(homedir(),'.config','google-chrome','NativeMessagingHosts')];
if(args.includes('--uninstall')){
  for(const directory of manifestDirs)await rm(join(directory,`${name}.json`),{force:true});
  // Other browsers may share this runtime. Unregister only the selected browser;
  // keep the shared executable and account records until the user removes them.
  console.log('Removed the selected browser registrations. Shared components and account records remain. Sign out in the extension and disconnect authorization in ChatGPT settings before deleting shared data.');
}else{
  const extensionId=(await readFile(join(root,'dist/extension-id.txt'),'utf8')).trim();
  if(!/^[a-p]{32}$/.test(extensionId))throw new Error('Invalid extension ID. Run npm run build first.');
  await mkdir(dataDir,{recursive:true,mode:0o700});await chmod(dataDir,0o700);
  await cp(join(root,'dist/native/host.mjs'),join(dataDir,'host.mjs'));await cp(join(root,'dist/native/jose-LICENSE.md'),join(dataDir,'jose-LICENSE.md'));
  await cp(join(root,'dist/extension'),join(dataDir,'extension'),{recursive:true});
  const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
  const launcher=join(dataDir,'launch-host');
  await writeFile(launcher,`#!/bin/sh\nexport LEAF_TRANSLATE_DATA_DIR=${quote(dataDir)}\nexec ${quote(process.execPath)} ${quote(join(dataDir,'host.mjs'))} "$@"\n`,{mode:0o700});await chmod(launcher,0o700);
  for(const directory of manifestDirs){await mkdir(directory,{recursive:true});await writeFile(join(directory,`${name}.json`),JSON.stringify({name,description:'Leaf Translate official ChatGPT connection',path:launcher,type:'stdio',allowed_origins:[`chrome-extension://${extensionId}/`]},null,2)+'\n');}
  console.log(`Installed local component (${browser}).\nExtension ID: ${extensionId}\nLoad this folder in your browser extension manager: ${join(dataDir,'extension')}\nThen choose Continue with ChatGPT in Leaf Translate to authorize your own account.`);
}
