import {validate,hash,UUID,STATUSES} from './system-contract.mjs';
export const ORIGIN='https://haru-hankan.onrender.com';
export const ADMIN_ID='4d2b022c-20f7-439a-9dac-9d8d21dbcb1a';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function reply(req,status,body) {
  const cors=req.headers.get('origin')===ORIGIN ? {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key','Access-Control-Allow-Methods':'POST,OPTIONS'} : {};
  return new Response(body===null?null:JSON.stringify(body),{status,headers:{...headers,...cors}});
}
async function json(req,max=24576) {
  if (!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) throw 415;
  const reader=req.body?.getReader();if(!reader)throw 400;
  let length=0;const chunks=[];
  try {for (;;) {const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>max){await reader.cancel();throw 413;}chunks.push(part.value);}}
  finally {reader.releaseLock();}
  const all=new Uint8Array(length);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  try {const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));if(!data||Array.isArray(data)||typeof data!=='object')throw 400;return data;} catch (_) {throw 400;}
}
function preflight(req) {
  if(req.headers.get('origin')!==ORIGIN)return reply(req,403,{code:'ORIGIN_REJECTED'});
  if(req.method==='OPTIONS')return reply(req,204,null);
  if(req.method!=='POST')return reply(req,405,{code:'METHOD_NOT_ALLOWED'});
}
const codes={INVALID:422,CONFLICT:409,RATE_LIMITED:429,STALE_REVISION:409,NOT_FOUND:404,FORBIDDEN:403};
export function createSubmit({rpc,accepting=false,now=()=>Date.now()}) {
  return async req=>{
    const early=preflight(req);if(early)return early;
    if(!accepting)return reply(req,503,{code:'NOT_ACCEPTING'});
    try {
      const body=await json(req);
      const key=req.headers.get('idempotency-key')||'';
      if(!UUID.test(key))return reply(req,422,{code:'INVALID_KEY'});
      if(typeof body.website!=='string' || body.website.trim() || !Number.isSafeInteger(body.started_at) || body.started_at>now()-3000 || body.started_at<now()-86400000)return reply(req,422,{code:'INVALID'});
      const parsed=validate(body);
      if(Object.keys(parsed.errors).length)return reply(req,422,{code:'VALIDATION',errors:parsed.errors});
      const result=await rpc('submit_haru_hankan_system_inquiry',{p_key:key,p_payload:parsed.value,p_hash:await hash(parsed.value)});
      if(result?.code)return reply(req,codes[result.code]||503,{code:result.code});
      if(!result || result.stored!==true || !/^HS-[0-9A-F]{32}$/.test(result.reference))return reply(req,503,{code:'SAVE_UNCONFIRMED'});
      return reply(req,result.replayed?200:201,{stored:true,reference:result.reference,replayed:!!result.replayed});
    } catch(error) {return reply(req,typeof error==='number'?error:503,{code:typeof error==='number'?'INVALID_REQUEST':'SAVE_UNCONFIRMED'});}
  };
}
function management(body) {
  const allowed={list:['action','status','due_only','cursor'],detail:['action','id'],change:['action','id','request_id','expected_revision','status','memo','ended_at']};
  if(!Object.hasOwn(allowed,body.action)||Object.keys(body).some(k=>!allowed[body.action].includes(k)))throw 422;
  if(body.action==='list'){
    if(body.status!==undefined&&body.status!=='all'&&!Object.hasOwn(STATUSES,body.status))throw 422;
    if(body.due_only!==undefined&&typeof body.due_only!=='boolean')throw 422;
    if(body.cursor!==undefined&&body.cursor!==null&&(!UUID.test(body.cursor.id)||typeof body.cursor.created_at!=='string'||body.cursor.created_at.length>40||!Number.isFinite(Date.parse(body.cursor.created_at))))throw 422;
  }else if(!UUID.test(body.id))throw 422;
  if(body.action==='change'&&(!UUID.test(body.request_id)||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<1||!Object.hasOwn(STATUSES,body.status)||typeof body.memo!=='string'||[...body.memo].length>1000||/[\u0000-\u0008\u000e-\u001f]/.test(body.memo)))throw 422;
  if(body.action==='change'&&body.status==='closed'&&(typeof body.ended_at!=='string'||body.ended_at.length>40||!Number.isFinite(Date.parse(body.ended_at))||Date.parse(body.ended_at)>Date.now()))throw 422;
  const canonical=Object.fromEntries(allowed[body.action].filter(key=>Object.hasOwn(body,key)).map(key=>[key,body[key]]));
  if(canonical.id)canonical.id=canonical.id.toLowerCase();
  if(canonical.request_id)canonical.request_id=canonical.request_id.toLowerCase();
  if(canonical.action==='change')canonical.ended_at=canonical.status==='closed'?new Date(canonical.ended_at).toISOString():'';
  return canonical;
}
export function createManage({rpc,getUser}) {
  return async req=>{
    const early=preflight(req);if(early)return early;
    const token=(req.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i)?.[1];
    if(!token)return reply(req,401,{code:'AUTH_REQUIRED'});
    try {
      const user=await getUser(token);
      if(!user)return reply(req,401,{code:'AUTH_REQUIRED'});
      if(user.id!==ADMIN_ID || user.email?.toLowerCase()!=='zxc1316@naver.com' || !user.email_confirmed_at || user.is_anonymous || (user.banned_until&&Date.parse(user.banned_until)>Date.now()))return reply(req,403,{code:'FORBIDDEN'});
      const body=management(await json(req,8192));
      const result=await rpc('manage_haru_hankan_system_inquiries',{p_actor:user.id,p_request:body,p_hash:await hash(body)});
      if(result?.code)return reply(req,codes[result.code]||503,{code:result.code});
      return reply(req,200,result);
    }catch(error){return reply(req,typeof error==='number'?error:503,{code:typeof error==='number'?'INVALID_REQUEST':'UNAVAILABLE'});}
  };
}
export function adapter(url,serviceKey,fetcher=fetch) {
  // Values come from the platform at runtime. Never log, export or return server keys.
  const address=new URL(url);
  if(address.protocol!=='https:'||!address.hostname.endsWith('.supabase.co'))throw Error('Invalid project URL');
  return {
    async rpc(name,args){
      const res=await fetcher(address.origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify(args)});
      if(!res.ok)throw Error('Database request failed');return res.json();
    },
    async getUser(token){
      const res=await fetcher(address.origin+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:'Bearer '+token}});
      if(res.status===401||res.status===403)return null;if(!res.ok)throw Error('Auth unavailable');return res.json();
    }
  };
}
