import { homedir } from 'node:os';
import { join } from 'node:path';
import { Auth } from './auth.js';
import { CredentialStore } from './store.js';
import { listModels, translate } from './inference.js';
import { encodeMessage, FrameDecoder } from './framing.js';
import { AppError, publicError } from '../shared/protocol.js';
// Replaced at build time with the public extension ID.
const allowedOrigin=`chrome-extension://${EXTENSION_ID}/`;
if(process.argv[2]!==allowedOrigin) process.exit(1);
const directory=process.platform==='darwin'?join(homedir(),'Library','Application Support','Leaf Translate'):join(homedir(),'.config','leaf-translate');
const send=message=>process.stdout.write(encodeMessage(message));
const auth=new Auth(new CredentialStore(process.env.LEAF_TRANSLATE_DATA_DIR || directory),()=>send({event:'accountChanged'}));
const running=new Map();
let accountBusy=false;
const abortAll=()=>{for(const controller of running.values())controller.abort();};
async function handle(message) {
  const {id,method,params}=message || {};
  if(typeof id!=='string' || id.length>100)return;
  try {
    let result;
    if(method==='status')result=await auth.status();
    else if(method==='login' || method==='select' || method==='logout' || method==='cancelLogin') {
      if(accountBusy)throw new AppError('BUSY','账号正在更新，请稍候。');accountBusy=true;abortAll();
      try {result=method==='login'?await auth.signIn(params):method==='select'?await auth.select(params?.profileId):method==='logout'?await auth.signOut():(auth.finishLogin(),await auth.status());}finally{accountBusy=false;}
    } else if(method==='models')result=await listModels(auth);
    else if(method==='cancel'){running.get(params?.requestId)?.abort();result={cancelled:true};}
    else if(method==='translate') {
      if(accountBusy || auth.pending)throw new AppError('BUSY','请先完成账号连接。');
      if(running.size>=4)throw new AppError('BUSY','已有多个页面正在翻译，请稍后重试。');
      const controller=new AbortController();running.set(id,controller);
      try{result=await translate(auth,params,controller.signal);}finally{running.delete(id);}
    }else throw new AppError('METHOD','不支持的操作。');
    send({id,ok:true,result});
  }catch(e){send({id,ok:false,error:e?.name==='AbortError'?{code:'CANCELLED',message:'翻译已停止。'}:publicError(e)});}
}
const decoder=new FrameDecoder(handle);
process.stdin.on('data',chunk=>{try{decoder.push(chunk);}catch{abortAll();process.exit(1);}});
process.stdin.on('end',()=>{abortAll();auth.finishLogin();process.exit(0);});
process.stdout.on('error',()=>process.exit(0));
