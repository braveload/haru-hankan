// Shared browser/server validation. The public copy is checked byte-for-byte in tests.
export const CONSENT_VERSION = 'system-2026-10-21-v1';
export const TYPES = {crm:'CRM',leave:'연차 관리',quote:'견적 관리',booking:'예약 관리',stock:'재고 관리',task:'업무 관리',other:'기타·복합'};
export const STATUSES = {new:'신규',reviewing:'검토 중',consulting:'상담 진행',quoted:'견적 발송',contracted:'계약',closed:'종료'};
export const BUDGETS = {'':'선택하지 않음',undecided:'아직 정하지 않았어요',under300:'300만원 미만','300to1000':'300만~1,000만원',over1000:'1,000만원 이상'};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const REFERENCE = /^HS-[0-9A-F]{32}$/;
const keys = ['company','manager','email','phone','type','work','users','programs','deadline','budget','requirements','consent','consent_version','website','started_at'];
const forbiddenControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
export function validate(raw) {
  const errors = {}, value = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {errors:{form:'입력 형식을 확인해 주세요.'}};
  if (Object.keys(raw).some(key=>!keys.includes(key))) errors.form='허용되지 않은 입력 항목입니다.';
  for (const [key,max,required] of [['company',100,true],['manager',100,true],['email',254,true],['phone',30,true],['work',2000,true],['programs',500,false],['requirements',2000,false]]) {
    const text = raw[key] === undefined && !required ? '' : raw[key];
    if (typeof text !== 'string') {errors[key]='문자로 입력해 주세요.';continue;}
    value[key]=text.trim().normalize('NFC');
    if ((required && !value[key]) || [...value[key]].length>max || forbiddenControl.test(value[key])) errors[key]=`필수 여부와 최대 ${max}자를 확인해 주세요.`;
  }
  if (value.email) {value.email=value.email.toLowerCase();if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email='이메일 형식을 확인해 주세요.';}
  if (value.phone) {value.phone=value.phone.replace(/[ ().-]/g,'');if (!/^\+?[0-9]{7,15}$/.test(value.phone)) errors.phone='연락 가능한 전화번호를 입력해 주세요.';}
  value.type=raw.type;
  if (typeof raw.type!=='string' || !Object.hasOwn(TYPES,raw.type)) errors.type='시스템 유형을 선택해 주세요.';
  value.users=raw.users ?? null;
  if (value.users!==null && (!Number.isInteger(value.users) || value.users<1 || value.users>100000)) errors.users='1~100,000 사이의 정수를 입력해 주세요.';
  value.deadline=raw.deadline ?? '';
  if (typeof value.deadline!=='string' || (value.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(value.deadline) || !Number.isFinite(Date.parse(value.deadline+'T00:00:00Z')) || new Date(value.deadline+'T00:00:00Z').toISOString().slice(0,10)!==value.deadline))) errors.deadline='유효한 날짜를 입력해 주세요.';
  value.budget=raw.budget ?? '';
  if (typeof value.budget!=='string' || !Object.hasOwn(BUDGETS,value.budget)) errors.budget='예산 항목을 확인해 주세요.';
  value.consent=raw.consent;
  value.consent_version=raw.consent_version;
  if (raw.consent!==true || raw.consent_version!==CONSENT_VERSION) errors.consent='안내를 읽고 개인정보 수집·이용에 동의해 주세요.';
  // Fixed property order for a canonical request hash. Honeypot and timing are not saved.
  return {value:Object.fromEntries(['company','manager','email','phone','type','work','users','programs','deadline','budget','requirements','consent','consent_version'].map(key=>[key,value[key]])),errors};
}
export async function hash(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
