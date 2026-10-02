import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateBatch,parseTranslations} from '../src/shared/protocol.js';
import {buildAuthorization,validateCallback,Auth} from '../src/native/auth.js';
import {CredentialStore} from '../src/native/store.js';
import {readResponseStream,translate} from '../src/native/inference.js';
import {FrameDecoder,encodeMessage} from '../src/native/framing.js';
const item={id:'p1',text:'A ⟦0⟧link⟦/0⟧.'};
const batch={model:'test-model',target:'zh-CN',items:[item]};
const stream=(frames,chunk=7)=>new Response(new ReadableStream({start(controller){const bytes=new TextEncoder().encode(frames.map(f=>'data: '+JSON.stringify(f)+'\r\n\r\n').join(''));for(let i=0;i<bytes.length;i+=chunk)controller.enqueue(bytes.slice(i,i+chunk));controller.close();}}));

test('batch validation rejects duplicate IDs, invalid language, oversize and arbitrary fields',()=>{
  assert.throws(()=>validateBatch({...batch,items:[item,item]}));assert.throws(()=>validateBatch({...batch,target:'unknown'}));assert.throws(()=>validateBatch({...batch,items:[{id:'x',text:'a'.repeat(6001)}]}));assert.deepEqual(Object.keys(validateBatch({...batch,endpoint:'https://evil.invalid'})).sort(),['items','model','target']);
});
test('translation response must match every ID and formatting marker',()=>{
  assert.equal(parseTranslations(JSON.stringify({translations:[{id:'p1',text:'一个⟦0⟧链接⟦/0⟧。'}]}),[item])[0].id,'p1');
  for(const result of [{translations:[]},{translations:[{id:'p2',text:'wrong'}]},{translations:[{id:'p1',text:'lost link'}]}])assert.throws(()=>parseTranslations(JSON.stringify(result),[item]));
});
test('SSE handles fragmented UTF-8, CRLF, multiline transport and terminal success',async()=>{
  assert.equal(await readResponseStream(stream([{type:'response.output_text.delta',delta:'中文'},{type:'response.completed',response:{status:'completed'}}],1)),'中文');
});
test('SSE rejects truncation, incomplete output and late quota errors',async()=>{
  await assert.rejects(readResponseStream(stream([{type:'response.output_text.delta',delta:'partial'}])),e=>e.code==='INTERRUPTED');
  await assert.rejects(readResponseStream(stream([{type:'response.incomplete'}])),e=>e.code==='INCOMPLETE');
  await assert.rejects(readResponseStream(stream([{type:'response.output_text.delta',delta:'partial'},{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}])),e=>e.code==='subscription_sharing_usage_limit_exceeded');
});
test('public OAuth registration uses PKCE, stable host, nonce and full scopes',()=>{
  const p={hostId:'urn:uuid:test',state:'state',nonce:'nonce',verifier:'v'.repeat(43),redirectUri:'http://127.0.0.1:43210/auth/callback'};
  const url=buildAuthorization(p);assert.equal(url.origin,'https://auth.openai.com');assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(url.searchParams.get('ext_agent_host_id'),p.hostId);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('code_challenge').length,43);assert.match(url.searchParams.get('scope'),/chatgpt.tokens.use.direct/);
  const returning=buildAuthorization({...p,profile:{clientId:'oaiapp_saved',email:'example@example.com',idToken:'hint'}});assert.equal(returning.searchParams.get('client_id'),'oaiapp_saved');assert.equal(returning.searchParams.has('agent_name_hint'),false);assert.equal(returning.searchParams.get('id_token_hint'),'hint');assert.equal(returning.searchParams.has('prompt'),false);
});
test('OAuth callback rejects state mismatch, declined authorization and client substitution',()=>{
  const callback=s=>new URL('http://127.0.0.1:123/auth/callback?'+s);
  assert.throws(()=>validateCallback(callback('state=wrong&code=x&client_id=oaiapp_new'),{state:'good'}));
  assert.throws(()=>validateCallback(callback('state=good&error=access_denied'),{state:'good'}));
  assert.throws(()=>validateCallback(callback('state=good&code=x&client_id=oaiapp_other'),{state:'good',profile:{clientId:'oaiapp_expected'}}));
  assert.deepEqual(validateCallback(callback('state=good&code=x'),{state:'good',profile:{clientId:'oaiapp_saved'}}),{clientId:'oaiapp_saved',code:'x'});
});
test('native framing accepts fragmented and combined messages; rejects oversize',()=>{
  const messages=[];const decoder=new FrameDecoder(m=>messages.push(m));const data=Buffer.concat([encodeMessage({text:'中文'}),encodeMessage({id:2})]);for(const byte of data)decoder.push(Buffer.from([byte]));assert.deepEqual(messages,[{text:'中文'},{id:2}]);const bad=Buffer.alloc(4);bad.writeUInt32LE(2000000);assert.throws(()=>decoder.push(bad));
});
test('credentials serialize concurrent writes and survive process-like store instances',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'leaf-test-'));try{const a=new CredentialStore(dir),b=new CredentialStore(dir);await a.withState(s=>{s.counter=0;});await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).withState(async s=>{await new Promise(r=>setTimeout(r,5));s.counter++;})));const value=await a.read();assert.equal(value.counter,8);assert.match(value.hostId,/^urn:uuid:/);assert.equal((await stat(a.file)).mode&0o777,0o600);assert.equal((await stat(dir)).mode&0o777,0o700);}finally{await rm(dir,{recursive:true,force:true});}
});
test('refresh rotation is serialized and never exposed through status',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'leaf-auth-'));const old=globalThis.fetch;let calls=0;
  try{
    const store=new CredentialStore(dir);await store.withState(s=>{s.active='oaiapp_test';s.profiles=[{clientId:s.active,subject:'subject',accessToken:'old',refreshToken:'refresh-old',expiresAt:0,scopes:['chatgpt.tokens.use.direct']}];});
    globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.body.get('client_id'),'oaiapp_test');assert.equal(options.body.has('scope'),false);return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600});};
    const auth=new Auth(store);await Promise.all([auth.access(),auth.access()]);assert.equal(calls,1);assert.equal((await store.read()).profiles[0].refreshToken,'rotated');assert.doesNotMatch(JSON.stringify(await auth.status()),/rotated|accessToken|refreshToken/);
  }finally{globalThis.fetch=old;await rm(dir,{recursive:true,force:true});}
});
test('terminal refresh failure clears tokens but keeps registration and host',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'leaf-expiry-'));const old=globalThis.fetch;
  try{const store=new CredentialStore(dir);await store.withState(s=>{s.active='oaiapp_test';s.profiles=[{clientId:s.active,accessToken:'bad',refreshToken:'bad',expiresAt:0}];});const before=await store.read();globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});await assert.rejects(new Auth(store).access(),e=>e.code==='LOGIN_REQUIRED');const after=await store.read();assert.equal(after.hostId,before.hostId);assert.equal(after.profiles[0].clientId,'oaiapp_test');assert.equal(after.profiles[0].refreshToken,undefined);}finally{globalThis.fetch=old;await rm(dir,{recursive:true,force:true});}
});
test('Responses request uses authorized OAuth route and never adds billed fallback or unsupported fields',async()=>{
  const old=globalThis.fetch;
  try{globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer local-credential');const body=JSON.parse(options.body);assert.equal(body.stream,true);assert.equal(body.store,false);for(const key of ['temperature','max_output_tokens','previous_response_id'])assert.equal(key in body,false);return stream([{type:'response.output_text.delta',delta:JSON.stringify({translations:[{id:'p1',text:'一个⟦0⟧链接⟦/0⟧。'}]})},{type:'response.completed'}]);};assert.equal((await translate({access:async()=>({token:'local-credential'})},batch,new AbortController().signal)).length,1);}finally{globalThis.fetch=old;}
});

test('ID token signature, issuer, audience, expiry, nonce and returning identity are all verified',async()=>{
  const {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet}=await import('jose');
  const {verifyIdentity}=await import('../src/native/auth.js');const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);const keys=createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'RS256'}]});
  const sign=(overrides={})=>new SignJWT({nonce:'nonce',...overrides}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_fixture').setSubject('account').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const token=await sign();assert.equal((await verifyIdentity(token,'oaiapp_fixture','nonce','account',keys)).sub,'account');
  await assert.rejects(verifyIdentity(token,'oaiapp_wrong','nonce','account',keys));await assert.rejects(verifyIdentity(token,'oaiapp_fixture','wrong','account',keys));await assert.rejects(verifyIdentity(token,'oaiapp_fixture','nonce','other-account',keys));
  const expired=await new SignJWT({nonce:'nonce'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_fixture').setSubject('account').setIssuedAt(1).setExpirationTime(2).sign(privateKey);await assert.rejects(verifyIdentity(expired,'oaiapp_fixture','nonce','account',keys));
  const badIssuer=await new SignJWT({nonce:'nonce'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://evil.example').setAudience('oaiapp_fixture').setSubject('account').setIssuedAt().setExpirationTime('1h').sign(privateKey);await assert.rejects(verifyIdentity(badIssuer,'oaiapp_fixture','nonce','account',keys));
});
