import {PROJECT_URL,PUBLIC_ANON_KEY} from './system-intake-public-config.mjs';
const ORIGIN='https://haru-hankan.onrender.com';
const ID='1dd7bf43-0fa5-42de-85a9-b0f231073b67';
const REFERENCE='HS-34A59681A0DE4939A7DE1C1A64AE3ED0';
export async function verifyAdministrator(auth,send) {
  const verified=await auth.getUser();
  const user=verified.data?.user;
  if(verified.error||!user)return {auth:false,api:false,record:false,message:'기존 관리자 로그인이 필요합니다.'};
  if(user.id!=='4d2b022c-20f7-439a-9dac-9d8d21dbcb1a'||user.email?.toLowerCase()!=='zxc1316@naver.com'||!user.email_confirmed_at)return {auth:false,api:false,record:false,message:'허용된 기존 관리자 계정이 아닙니다.'};
  // Normal app authentication: session is used only for this request in browser memory.
  // It is never printed, returned, copied to a tool, or persisted by this checker.
  const sessionResult=await auth.getSession();
  if(sessionResult.error||!sessionResult.data?.session)return {auth:false,api:false,record:false,message:'관리자 로그인 세션이 만료됐습니다.'};
  const response=await send({method:'POST',headers:{Authorization:'Bearer '+sessionResult.data.session.access_token,apikey:PUBLIC_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'detail',id:ID}),cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)return {auth:true,api:false,record:false,message:'관리 API가 허용하지 않았습니다. 접수는 활성화하지 않습니다.'};
  const data=await response.json();
  const matches=data.inquiry?.id===ID&&data.inquiry?.reference===REFERENCE&&data.inquiry?.payload?.company?.startsWith('[SYNTHETIC-HARU-INTAKE-');
  return {auth:true,api:true,record:!!matches,message:matches?'세 항목 모두 통과했습니다. 합성 접수번호: '+REFERENCE:'합성 기록이 일치하지 않습니다. 검증 완료로 처리하지 않습니다.'};
}
if(typeof document!=='undefined') {
  const button=document.querySelector('#check'),status=document.querySelector('#check-status');
  const labels=[['auth','기존 관리자 로그인 확인'],['api','관리 API 실제 인증 응답'],['record','합성 접수번호 일치']];
  function display(result){
    for(const [key,label] of labels){
      const skipped=(key!=='auth'&&!result.auth)||(key==='record'&&!result.api);
      document.querySelector('#check-'+key).textContent=label+': '+(result[key]?'통과':skipped?'확인 안함':'미통과');
    }
  }
  if(location.origin!==ORIGIN){status.textContent='로컬 검토 화면입니다. 실제 인증 검증은 아직 불가하며 서버에 요청하지 않습니다.';}
  else if(!window.supabase){status.textContent='정상 로그인 모듈을 불러오지 못했습니다. 검증하지 않았습니다.';}
  else {
    document.querySelector('#stage-notice').textContent='관리자 검증 전용 화면입니다. 공개 접수와 상태 변경 기능은 계속 비활성입니다.';
    const client=window.supabase.createClient(PROJECT_URL,PUBLIC_ANON_KEY,{auth:{storage:sessionStorage,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    button.disabled=false;status.textContent='기존 로그인과 같은 탭에서 확인 버튼을 눌러주세요.';
    button.addEventListener('click',async()=>{
      button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='합성 1건의 읽기 전용 응답을 확인합니다…';
      for(const [key,label] of labels)document.querySelector('#check-'+key).textContent=label+': 미검증';
      try {
        const result=await verifyAdministrator(client.auth,options=>fetch(PROJECT_URL+'/functions/v1/manage-haru-hankan-system-inquiries',options));
        display(result);
        status.textContent=result.message;
      }catch(_){status.textContent='응답을 확인하지 못했습니다. 검증 완료가 아닙니다.';}
      finally{button.disabled=false;button.removeAttribute('aria-busy');status.focus();}
    });
  }
}
