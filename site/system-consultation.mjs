import {validate,CONSENT_VERSION} from './system-intake-contract.mjs';
import {createFlow} from './system-intake-flow.mjs';
import {PROJECT_URL,PUBLIC_ANON_KEY} from './system-intake-public-config.mjs';
const form=document.querySelector('#system-consultation');
const fields=form.querySelector('fieldset'),button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]'),reset=form.querySelector('[data-new-inquiry]');
let storage;try{storage=sessionStorage;}catch(_){storage=null;}
const flow=createFlow(storage,(payload,key)=>fetch(PROJECT_URL+'/functions/v1/submit-haru-hankan-system-inquiry',{method:'POST',headers:{Authorization:'Bearer '+PUBLIC_ANON_KEY,apikey:PUBLIC_ANON_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)}));
const started=Date.now();
function notice(text){status.textContent=text;status.focus();}
function errors(values){for(const node of form.querySelectorAll('[data-error]'))node.textContent='';for(const node of form.querySelectorAll('[aria-invalid]'))node.removeAttribute('aria-invalid');for(const [name,text]of Object.entries(values)){const field=form.elements.namedItem(name),node=form.querySelector('[data-error="'+name+'"]');if(node)node.textContent=text;if(field)field.setAttribute('aria-invalid','true');}}
function confirmed(reference){notice('문의가 접수되었습니다. 접수번호: '+reference+'\n확인 후 연락드리겠습니다. 새로고침해도 다시 접수되지 않습니다.');button.disabled=true;reset.hidden=false;}
if(document.documentElement.dataset.accepting==='true'){fields.disabled=false;const prior=flow.read();if(prior?.state==='confirmed')confirmed(prior.reference);else if(prior)notice('이전 요청의 접수 확인이 필요합니다. 같은 내용을 입력하고 다시 확인하면 같은 접수번호를 반환합니다.');}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(fields.disabled||button.disabled)return;
  const raw=Object.fromEntries(new FormData(form));raw.users=raw.users===''?null:Number(raw.users);raw.consent=form.elements.consent.checked;raw.consent_version=CONSENT_VERSION;
  const parsed=validate(raw);errors(parsed.errors);
  if(Object.keys(parsed.errors).length){notice('입력 항목을 확인해 주세요.');form.querySelector('[aria-invalid=true]')?.focus();return;}
  button.disabled=true;button.setAttribute('aria-busy','true');form.setAttribute('aria-busy','true');notice('저장 결과를 확인하고 있습니다…');
  const result=await flow.submit(parsed.value,{website:raw.website||'',started_at:started});
  button.removeAttribute('aria-busy');form.removeAttribute('aria-busy');
  if(result.state==='confirmed'){confirmed(result.reference);return;}
  button.disabled=false;
  if(result.state==='invalid'){errors(result.errors);notice('접수되지 않았습니다. 입력 내용·동의를 확인하거나 잠시 후 같은 내용으로 다시 시도해 주세요.');}
  else if(result.state==='changed'||result.state==='conflict')notice('이전 요청과 내용이 달라 재전송을 멈췄습니다. 이전과 같은 내용으로 확인하거나 기존 문의 채널로 접수 여부를 확인해 주세요.');
  else if(result.state==='storage-error')notice('브라우저 임시 저장을 사용할 수 없어 전송하지 않았습니다. 세션 저장을 허용하거나 기존 문의 채널을 이용해 주세요.');
  else notice('저장 여부를 아직 확인할 수 없습니다. 입력은 유지됩니다. 같은 문의 다시 확인을 누르면 같은 요청 키로 안전하게 확인합니다.');
  button.textContent='같은 문의 다시 확인';
});
reset.addEventListener('click',()=>{flow.reset();location.reload();});
