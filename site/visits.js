(()=>{
  'use strict';
  const config=window.VISIT_CONFIG;
  const output=document.querySelector('[data-visit-counter]');
  if(!output||!config)return;
  const format=n=>n.toLocaleString('ko-KR');
  const valid=data=>Number.isSafeInteger(data.today)&&Number.isSafeInteger(data.total)&&data.today>=0&&data.total>=data.today&&/^\d{4}-\d{2}-\d{2}$/.test(data.day);
  if(!config.enabled){output.textContent='방문 통계 · 집계 준비 중';return;}
  let visitor;
  function identity(){try{let id=localStorage.getItem('site-visit-id-v1');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||'')){id=crypto.randomUUID();localStorage.setItem('site-visit-id-v1',id);}return localStorage.getItem('site-visit-id-v1');}catch{return null;}}
  // Native same-origin lock also covers two tabs opened on the first visit.
  const ready=(navigator.locks?navigator.locks.request('site-visit-id-v1',identity):Promise.resolve(identity())).then(id=>{visitor=id;}).catch(()=>{visitor=null;});
  let pending=false;
  async function refresh(){
    if(pending||document.hidden)return;pending=true;
    try{
      await ready;
      const page=location.pathname==='/index.html'?'/':location.pathname;
      // Only fixed path, opaque random ID and site name leave this page.
      const body=visitor?{action:'record',site:config.site,visitor,page}:{action:'summary',site:config.site};
      const res=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});
      if(!res.ok)throw Error();const data=await res.json();if(!valid(data))throw Error();
      output.textContent='오늘 '+format(data.today)+'명 / 전체 '+format(data.total)+'명';
      output.title=data.day+' 한국시간 · 익명 브라우저 기준'+(!visitor?' · 저장소 차단으로 이 방문은 집계 제외':'');
    }catch{output.textContent='방문 통계 · 집계 확인 불가';output.title='잠시 후 다시 확인합니다.';}
    finally{pending=false;}
  }
  refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
})();
