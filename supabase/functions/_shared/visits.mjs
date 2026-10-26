import {ADMIN_ID} from './system-handlers.mjs';
export const SITES={
  haru:{origin:'https://haru-hankan.onrender.com',pages:['/','/landing-page-service.html','/logo-design-service.html','/logo-samples.html','/landing-sample.html','/landing-sample-2.html','/landing-sample-3.html','/cardpilot-landing.html','/system-development.html','/system-consultation.html','/privacy.html','/terms.html']},
  cardpilot:{origin:'https://cardpilot-control-20261023.ti-ger82.chatgpt.site',pages:['/','/download-guide']}
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const kstDay=(time=Date.now())=>new Date(time+9*3600000).toISOString().slice(0,10);
async function body(req){
  if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw 415;
  const reader=req.body?.getReader();if(!reader)throw 400;
  let size=0,text='';const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw 413;}text+=decoder.decode(value,{stream:true});}}finally{reader.releaseLock();}
  try{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw 400;return data;}catch{throw 400;}
}
export function createVisits({rpc,getUser}){
  return async req=>{
    const origin=req.headers.get('origin');
    const allowed=Object.values(SITES).some(s=>s.origin===origin);
    const reply=(status,value)=>new Response(value===null?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})}});
    if(!allowed)return reply(403,{code:'ORIGIN_REJECTED'});
    if(req.method==='OPTIONS')return reply(204,null);
    if(req.method!=='POST')return reply(405,{code:'METHOD_NOT_ALLOWED'});
    try{
      const b=await body(req);
      if(typeof b.site!=='string'||!Object.hasOwn(SITES,b.site))throw 422;
      let result;
      if(b.action==='admin'){
        if(origin!==SITES.haru.origin)throw 403;
        const token=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
        if(!token)throw 401;
        const user=await getUser(token);
        if(!user)throw 401;
        if(user.id!==ADMIN_ID||user.email?.toLowerCase()!=='zxc1316@naver.com'||!user.email_confirmed_at||user.is_anonymous||(user.banned_until&&Date.parse(user.banned_until)>Date.now()))throw 403;
        if(Object.keys(b).some(k=>!['action','site'].includes(k)))throw 422;
        result=await rpc('visit_admin',{p_site:b.site});
      }else{
        if(origin!==SITES[b.site].origin)throw 403;
        if(Object.keys(b).some(k=>!['action','site','visitor','page'].includes(k)))throw 422;
        if(b.action==='record'){
          if(typeof b.visitor!=='string'||!UUID.test(b.visitor)||typeof b.page!=='string'||!SITES[b.site].pages.includes(b.page))throw 422;
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.site+':'+b.visitor.toLowerCase()));
          const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
          result=await rpc('visit_record',{p_site:b.site,p_visitor:hash,p_page:b.page});
        }else if(b.action==='summary'){
          if(Object.keys(b).some(k=>!['action','site'].includes(k)))throw 422;
          result=await rpc('visit_summary',{p_site:b.site});
        }
        else throw 422;
      }
      if(!result||!Number.isSafeInteger(result.today)||!Number.isSafeInteger(result.total)||result.today<0||result.total<result.today)throw Error('Unavailable');
      if(typeof result.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(result.day)||(result.started_at!==null&&(typeof result.started_at!=='string'||!Number.isFinite(Date.parse(result.started_at)))))throw Error('Unavailable');
      // Explicit output projection prevents an upstream schema change leaking identifiers publicly.
      const output=b.action==='admin'?result:{today:result.today,total:result.total,day:result.day,started_at:result.started_at};
      return reply(200,output);
    }catch(e){return reply(typeof e==='number'?e:503,{code:typeof e==='number'?'REQUEST_REJECTED':'UNAVAILABLE'});}
  };
}
