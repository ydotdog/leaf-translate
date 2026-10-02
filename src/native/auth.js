import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError, APP_NAME } from '../shared/protocol.js';

const ISSUER='https://auth.openai.com';
const TOKEN=`${ISSUER}/api/accounts/oauth/token`;
const RESOURCE='https://api.openai.com/v1';
const SCOPE='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const jwks=createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const terminalRefresh = new Set(['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused']);
const random = ()=>randomBytes(32).toString('base64url');
export async function verifyIdentity(token,clientId,nonce,subject,keySet=jwks) {
  const {payload}=await jwtVerify(token,keySet,{issuer:ISSUER,audience:clientId,requiredClaims:['sub','exp','iat'],clockTolerance:5,algorithms:['RS256','ES256']});
  if(payload.nonce!==nonce || typeof payload.sub!=='string' || !payload.sub || (subject && subject!==payload.sub))throw new AppError('IDENTITY','登录身份校验失败。');
  return payload;
}
export function viewProfile(p) { return {id:p.clientId, label:`${p.email || 'ChatGPT 账号'} · ${p.clientId.slice(-6)}`, connected:Boolean(p.accessToken), sharing:Boolean(p.accessToken && p.scopes?.includes('chatgpt.tokens.use.direct'))}; }
export function buildAuthorization({profile,hostId,state,nonce,verifier,redirectUri,consent}) {
  const url=new URL(`${ISSUER}/api/accounts/authorize`);
  url.search=new URLSearchParams({client_id:profile?.clientId || 'dynamic_agent_client',ext_agent_host_id:hostId,response_type:'code',redirect_uri:redirectUri,scope:SCOPE,resource:RESOURCE,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();
  if (!profile) url.searchParams.set('agent_name_hint',APP_NAME);
  if (profile?.idToken) url.searchParams.set('id_token_hint',profile.idToken);
  if (profile?.email) url.searchParams.set('login_hint',profile.email);
  if (consent) url.searchParams.set('prompt','consent');
  return url;
}
export function validateCallback(url,pending) {
  if (url.searchParams.get('state')!==pending.state) throw new AppError('OAUTH_STATE','登录校验失败，请重试。');
  if (url.searchParams.has('error')) throw new AppError('OAUTH_DECLINED','未完成授权，你可以重新登录。');
  const clientId=url.searchParams.get('client_id') || pending.profile?.clientId;
  if (!clientId || clientId==='dynamic_agent_client' || !/^oaiapp_[a-zA-Z0-9_-]+$/.test(clientId)) throw new AppError('OAUTH_CLIENT','登录未返回有效注册信息。');
  if (pending.profile && pending.profile.clientId!==clientId) throw new AppError('OAUTH_CLIENT','登录账号注册信息不匹配。');
  const code=url.searchParams.get('code');
  if (!code) throw new AppError('OAUTH_CODE','登录回调缺少授权码。');
  return {clientId,code};
}
async function tokenRequest(body) {
  let response;
  try {response=await fetch(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(30000)});} catch {throw new AppError('NETWORK','无法连接 ChatGPT 登录服务，请稍后重试。');}
  const data=await response.json().catch(()=>({}));
  if (!response.ok) throw new AppError(typeof data.error==='string'?data.error:data.error?.code || 'AUTH_FAILED','登录凭据未获接受，请重新登录。',{status:response.status,requestId:response.headers.get('x-request-id')});
  return data;
}
function applyTokens(profile,data,{refresh=false}={}) {
  if (typeof data.access_token!=='string' || !Number.isFinite(data.expires_in) || data.expires_in<=0) throw new AppError('AUTH_FAILED','登录服务返回了不完整的凭据。');
  profile.accessToken=data.access_token; profile.expiresAt=Date.now()+data.expires_in*1000;
  if (typeof data.refresh_token==='string') profile.refreshToken=data.refresh_token;
  if (typeof data.scope==='string') profile.scopes=data.scope.split(/\s+/);
  else if (!refresh) profile.scopes=[];
}
function clearTokens(profile) { for(const k of ['accessToken','refreshToken','idToken','expiresAt','scopes']) delete profile[k]; }
function openBrowser(url) {
  const command=process.platform==='darwin'?'open':'xdg-open';
  return new Promise((resolve,reject)=>{ const child=spawn(command,[url],{stdio:'ignore'}); child.once('error',()=>reject(new AppError('BROWSER','无法打开浏览器，请检查默认浏览器设置。'))); child.once('exit',code=>code===0?resolve():reject(new AppError('BROWSER','无法打开登录页面。'))); });
}
export class Auth {
  constructor(store,onChange=()=>{}) { this.store=store; this.onChange=onChange; this.pending=null; this.lastError=null; }
  async status() {
    const s=await this.store.withState(s=>({active:s.active,profiles:s.profiles.map(viewProfile)}));
    return {...s,pending:Boolean(this.pending),error:this.lastError};
  }
  async signIn({profileId,consent=false}={}) {
    if (this.pending) throw new AppError('BUSY','已有登录页面打开，请完成或取消当前登录。');
    const {profile,hostId}=await this.store.withState(s=>({profile:profileId?s.profiles.find(p=>p.clientId===profileId):null,hostId:s.hostId}));
    if(profileId && !profile) throw new AppError('ACCOUNT','账号不存在。');
    this.lastError=null;
    const pending={state:random(),nonce:random(),verifier:random(),profile,hostId};
    const server=createServer(async(req,res)=>{
      const url=new URL(req.url, pending.redirectUri);
      res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'");
      if(req.method!=='GET' || url.pathname!=='/auth/callback' || req.headers.host!==new URL(pending.redirectUri).host || url.searchParams.get('state')!==pending.state || pending.used) {res.writeHead(400);res.end('Invalid callback');return;}
      pending.used=true;
      try {
        const {clientId,code}=validateCallback(url,pending);
        // Retain registration before exchange, including when the code has expired.
        await this.store.withState(s=>{if(!s.profiles.some(p=>p.clientId===clientId)) s.profiles.push({clientId,scopes:[]});});
        const data=await tokenRequest({grant_type:'authorization_code',client_id:clientId,code,code_verifier:pending.verifier,redirect_uri:pending.redirectUri,resource:RESOURCE});
        if(typeof data.id_token!=='string') throw new AppError('IDENTITY','登录缺少身份凭据。');
        const payload=await verifyIdentity(data.id_token,clientId,pending.nonce,profile?.subject);
        await this.store.withState(s=>{if(this.pending!==pending)throw new AppError('CANCELLED','登录已取消。');const p=s.profiles.find(p=>p.clientId===clientId);applyTokens(p,data);Object.assign(p,{subject:payload.sub,email:payload.email || '',idToken:data.id_token});s.active=clientId;});
        res.end('<!doctype html><meta charset="utf-8"><title>Leaf Translate</title><style>body{font:18px system-ui;max-width:560px;margin:15vh auto;padding:32px;color:#174b3c;background:#f4f6f1}</style><h1>已连接 ChatGPT</h1><p>可以关闭此页面，回到 Leaf Translate 开始阅读。</p>');
      } catch(e) {this.lastError=e instanceof AppError?e.message:'登录校验未通过，请重试。';res.writeHead(400);res.end('<meta charset="utf-8"><h1>未能完成登录</h1><p>请回到 Leaf Translate 查看状态并重试。</p>');}
      finally {this.finishLogin(pending);}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    pending.redirectUri=`http://127.0.0.1:${server.address().port}/auth/callback`;pending.server=server;
    pending.timer=setTimeout(()=>{this.lastError='登录已超时，请重新连接。';this.finishLogin();},10*60*1000);
    this.pending=pending;
    try {await openBrowser(buildAuthorization({...pending,consent}).href);} catch(e) {this.finishLogin();throw e;}
    return this.status();
  }
  finishLogin(expected=this.pending) {if(this.pending && this.pending===expected){clearTimeout(this.pending.timer);this.pending.server.close();this.pending=null;this.onChange();}}
  async select(profileId) {this.finishLogin();await this.store.withState(s=>{if(!s.profiles.some(p=>p.clientId===profileId)) throw new AppError('ACCOUNT','账号不存在。');s.active=profileId;});return this.status();}
  async access() {
    let failure;
    const result=await this.store.withState(async s=>{
      const p=s.profiles.find(p=>p.clientId===s.active);
      if(!p?.accessToken) throw new AppError('LOGIN_REQUIRED','请先连接 ChatGPT。');
      if(p.expiresAt<Date.now()+60000) {
        if(!p.refreshToken) throw new AppError('LOGIN_REQUIRED','登录已过期，请重新连接。');
        try {const data=await tokenRequest({grant_type:'refresh_token',client_id:p.clientId,refresh_token:p.refreshToken,resource:RESOURCE});applyTokens(p,data,{refresh:true});}
        catch(e) {if(terminalRefresh.has(e.code)){clearTokens(p);failure=e;return null;}throw e;}
      }
      if(!p.scopes.includes('chatgpt.tokens.use.direct')) throw new AppError('PLAN_PERMISSION','尚未授权使用 ChatGPT 额度，请在连接设置中开启。');
      return {token:p.accessToken,profileId:p.clientId};
    });
    if(failure) throw new AppError('LOGIN_REQUIRED','登录已失效，请重新连接 ChatGPT。');return result;
  }
  async signOut() {
    this.finishLogin();let revoked=false;
    await this.store.withState(async s=>{
      const p=s.profiles.find(p=>p.clientId===s.active);if(!p)return;
      if(p.refreshToken) {
        try {
          const discovery=await fetch(`${ISSUER}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
          const endpoint=new URL(discovery.revocation_endpoint);
          if(endpoint.origin!==ISSUER) throw new Error('Untrusted revocation endpoint');
          for(let i=0;i<2;i++) {
            const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:p.refreshToken,token_type_hint:'refresh_token',client_id:p.clientId}),signal:AbortSignal.timeout(10000)});
            if(r.status===200){revoked=true;break;}if(r.status<500)break;await new Promise(r=>setTimeout(r,500));
          }
        }catch{}
      }
      clearTokens(p);
    });
    return {...await this.status(),revoked};
  }
}
