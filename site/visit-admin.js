(()=>{
  const config=window.VISIT_CONFIG,notice=document.querySelector('#status'),stats=document.querySelector('#stats'),site=document.querySelector('#site');
  let client,generation=0;
  function clear(){stats.hidden=true;document.querySelector('#trend').replaceChildren();document.querySelector('#pages').replaceChildren();}
  const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
  async function load(){
    const current=++generation;clear();notice.textContent='통계를 확인합니다.';
    if(!config.enabled){notice.textContent='집계 준비 중입니다. 승인 후 서버 집계를 활성화하면 표시됩니다.';return;}
    try{
      if(!client)throw Error();const {data,error}=await client.auth.getSession();if(error||!data.session)throw Error();
      const res=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key,Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action:'admin',site:site.value}),cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
      if(!res.ok)throw Error();const result=await res.json();if(current!==generation)return;
      if(!Number.isSafeInteger(result.today)||!Number.isSafeInteger(result.total)||!Array.isArray(result.days)||!Array.isArray(result.pages))throw Error();
      document.querySelector('#today').textContent=result.today.toLocaleString('ko-KR')+'명';document.querySelector('#total').textContent=result.total.toLocaleString('ko-KR')+'명';
      document.querySelector('#start').textContent=result.started_at?'수집 시작: '+new Date(result.started_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' (한국시간)':'아직 수집된 방문이 없습니다.';
      const max=Math.max(1,...result.days.map(d=>d.visitors));
      for(const d of result.days){const row=node('div','');row.className='day';const bar=node('span','');bar.className='bar';bar.style.width=(100*d.visitors/max)+'%';row.append(node('span',d.day),bar,node('span',d.visitors+'명'));document.querySelector('#trend').append(row);}
      for(const p of result.pages){const row=node('tr','');row.append(node('td',p.page),node('td',p.viewers.toLocaleString('ko-KR')));document.querySelector('#pages').append(row);}
      if(!result.pages.length){const row=node('tr','');const cell=node('td','아직 수집된 페이지 열람이 없습니다.');cell.colSpan=2;row.append(cell);document.querySelector('#pages').append(row);}
      stats.hidden=false;notice.textContent=result.day+' 한국시간 기준 · 사이트별 분리 집계';
    }catch{if(current!==generation)return;clear();notice.textContent='통계를 확인할 수 없습니다. 기존 문의 관리에서 관리자 로그인 후 다시 확인해 주세요. 서버 미설정·통신 실패 시에도 숫자를 표시하지 않습니다.';}
  }
  if(window.supabase)client=window.supabase.createClient('https://hvnoylwqzpbxxhmnqbzb.supabase.co',config.key,{auth:{flowType:'implicit',storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  client?.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){generation++;clear();notice.textContent='로그아웃했습니다.';}});
  document.querySelector('#refresh').addEventListener('click',load);site.addEventListener('change',load);
  document.querySelector('#logout').addEventListener('click',async()=>{generation++;clear();await client?.auth.signOut();notice.textContent='로그아웃했습니다.';});
  load();
})();
