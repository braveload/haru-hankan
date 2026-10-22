import {STATUSES,TYPES,BUDGETS} from './system-intake-contract.mjs';
import {PROJECT_URL,PUBLIC_ANON_KEY} from './system-intake-public-config.mjs';
const notice=document.querySelector('#admin-status'),panel=document.querySelector('#admin-panel'),list=document.querySelector('#system-list'),detail=document.querySelector('#system-detail');
const filter=document.querySelector('#status-filter'),due=document.querySelector('#due-only'),next=document.querySelector('#next');
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function message(text){notice.textContent=text;}
let client,cursor=null,lastCursor=null,pendingChange=null;
async function request(body){
  const {data,error}=await client.auth.getSession();
  if(error||!data.session)throw Error('기존 관리자 로그인 세션이 필요합니다.');
  const response=await fetch(PROJECT_URL+'/functions/v1/manage-haru-hankan-system-inquiries',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:PUBLIC_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok)throw Error(response.status===401||response.status===403?'개발 상담 관리 권한이 없습니다.':response.status===409?'내용이 변경됐거나 같은 요청 키의 내용이 다릅니다. 상세를 다시 확인해 주세요.':'결과를 확인하지 못했습니다. 같은 요청으로 재시도할 수 있습니다.');
  return result;
}
async function load(reset=false){
  if(reset)cursor=null;
  message('개발 상담 목록을 확인합니다.');next.disabled=true;detail.hidden=true;
  try{
    const result=await request({action:'list',status:filter.value,due_only:due.checked,cursor});
    panel.hidden=false;
    list.replaceChildren();const items=result.inquiries||[];
    for(const item of items){
      const card=node('article');card.className='admin-item';
      card.append(node('h2',item.company),node('p',item.reference+' · '+(TYPES[item.type]||item.type)+' · '+STATUSES[item.status]));
      if(item.deletion_due_at)card.append(node('p','삭제 예정: '+new Date(item.deletion_due_at).toLocaleString('ko-KR')));
      const open=node('button','상세 보기');open.type='button';open.addEventListener('click',()=>show(item.id));card.append(open);list.append(card);
    }
    if(!items.length)list.append(node('p','해당하는 개발 상담이 없습니다.'));
    const last=items.at(-1);lastCursor=last?{created_at:last.created_at,id:last.id}:null;next.disabled=items.length<50;
    message('개발 상담 '+items.length+'건 표시 · 목록 최대 50건');
  }catch(_){message('목록을 확인하지 못했습니다. 기존 관리자 로그인과 새 API 배포 상태를 확인해 주세요.');}
}
async function show(id){
  message('상세를 확인합니다.');
  try{
    const result=await request({action:'detail',id}),item=result.inquiry;
    pendingChange=null;
    detail.replaceChildren();detail.hidden=false;
    detail.append(node('h2',item.reference),node('p','동의 버전: '+item.payload.consent_version+' · 동의 시각: '+new Date(item.consent_at).toLocaleString('ko-KR')));
    const values=node('dl');
    for(const [key,label] of [['company','회사명'],['manager','담당자명'],['email','이메일'],['phone','연락처'],['type','시스템 유형'],['work','개선 업무'],['users','사용자 수'],['programs','기존 프로그램'],['deadline','희망일'],['budget','예산'],['requirements','기타 요구']]){
      let text=item.payload[key];if(key==='type')text=TYPES[text];if(key==='budget')text=BUDGETS[text];values.append(node('dt',label),node('dd',text===null||text===''?'미입력':String(text)));
    }
    detail.append(values,node('p','종료일: '+(item.closed_at?new Date(item.closed_at).toLocaleString('ko-KR'):'미종료')+'\n삭제 예정: '+(item.deletion_due_at?new Date(item.deletion_due_at).toLocaleString('ko-KR'):'종료 시 계산')));
    const statusLabel=node('label','상담 상태');statusLabel.htmlFor='detail-status';const select=node('select');select.id='detail-status';
    for(const [value,text]of Object.entries(STATUSES)){const option=node('option',text);option.value=value;option.selected=value===item.status;select.append(option);}
    const memoLabel=node('label','메모 (개인정보·비밀번호 등 민감자료 입력 금지, 최대 1,000자)');memoLabel.htmlFor='detail-memo';const memo=node('textarea');memo.id='detail-memo';memo.maxLength=1000;
    const endLabel=node('label','실제 상담 종료일시 (종료 상태 선택 시 필수, 한국에서 사용 시 한국 시간)');endLabel.htmlFor='detail-ended';const ended=node('input');ended.type='datetime-local';ended.id='detail-ended';
    const endDate=new Date(item.closed_at||Date.now());ended.value=new Date(endDate.getTime()-endDate.getTimezoneOffset()*60000).toISOString().slice(0,16);ended.disabled=!!item.closed_at;
    const save=node('button','상태·메모 저장');save.type='button';
    save.addEventListener('click',async()=>{
      const same=pendingChange&&pendingChange.id===item.id;
      if(same&&(pendingChange.status!==select.value||pendingChange.memo!==memo.value)){message('이전 저장 결과가 불명확합니다. 이전과 같은 상태·메모로 재시도하거나 상세를 다시 확인해 주세요.');return;}
      if(select.value==='closed'&&!item.closed_at&&(!ended.value||!Number.isFinite(Date.parse(ended.value)))){message('실제 상담 종료일시를 확인해 주세요.');return;}
      const endValue=select.value==='closed'?(item.closed_at||new Date(ended.value).toISOString()):'';
      if(same&&pendingChange.ended_at!==endValue){message('이전 요청과 종료일시가 다릅니다. 상세를 다시 확인해 주세요.');return;}
      const body=same?pendingChange:{action:'change',id:item.id,request_id:crypto.randomUUID(),expected_revision:item.revision,status:select.value,memo:memo.value,ended_at:endValue};
      pendingChange=body;save.disabled=true;
      try{const saved=await request(body);if(saved.saved!==true)throw Error('저장 확인 실패');pendingChange=null;message('저장됐습니다.');await show(id);}
      catch(_){message('저장 결과를 확인하지 못했습니다. 같은 상태·메모로 재시도해 주세요. 변경 충돌이면 상세를 다시 열어 최신 상태를 확인하세요.');save.textContent='같은 변경 다시 확인';save.disabled=false;}
    });
    detail.append(statusLabel,select,endLabel,ended,memoLabel,memo,save,node('h3','처리 이력 (최신 100건)'));
    for(const event of result.events||[]){const entry=node('p',new Date(event.created_at).toLocaleString('ko-KR')+' · '+(STATUSES[event.after_status]||event.after_status)+' · 버전 '+event.resulting_revision+'\n'+(event.memo||''));entry.className='admin-event';detail.append(entry);}
    message('상세를 확인했습니다. 상태 종료는 실제 상담이 끝난 경우에만 선택하세요. 메모 추가로 종료일이 갱신되지는 않습니다.');
  }catch(_){message('상세를 확인하지 못했습니다. 관리자 세션·권한을 확인해 주세요.');}
}
document.querySelector('#refresh').addEventListener('click',()=>load(true));filter.addEventListener('change',()=>load(true));due.addEventListener('change',()=>load(true));next.addEventListener('click',()=>{cursor=lastCursor;load();});
try{
  if(!window.supabase)throw Error('module unavailable');
  client=window.supabase.createClient(PROJECT_URL,PUBLIC_ANON_KEY,{auth:{flowType:'implicit',storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const {data,error}=await client.auth.getSession();if(error||!data.session)throw Error('no session');
  const verified=await client.auth.getUser();if(verified.error||!verified.data.user)throw Error('unverified');
  await load(true);
}catch(_){message('기존 문의 관리 화면에서 로그인한 관리자 세션이 필요합니다. 이 화면은 로그인 메일을 새로 발송하지 않습니다.');}
