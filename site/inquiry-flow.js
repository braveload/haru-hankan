(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HaruInquiry = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  var key = 'haru-inquiry-receipt-v1';
  var referencePattern = /^HH-[A-F0-9]{8}$/;
  function read(storage) {
    try {
      var receipt = JSON.parse(storage.getItem(key));
      if (!receipt || !['pending', 'unknown', 'confirmed'].includes(receipt.state)) return null;
      if (receipt.state === 'confirmed' && !referencePattern.test(receipt.reference)) return null;
      return receipt;
    } catch (_) { return null; }
  }
  function create(storage, send) {
    var busy = false;
    function write(receipt) {
      try {
        storage.setItem(key, JSON.stringify(receipt));
        return storage.getItem(key) === JSON.stringify(receipt);
      } catch (_) { return false; }
    }
    return {
      receipt: function () { return read(storage); },
      submit: async function (payload) {
        if (busy || read(storage)) return { state: 'blocked' };
        if (payload.website) return { state: 'invalid' };
        // Only receipt state is persisted. Never store names, contact details or inquiry text.
        if (!write({ state: 'pending' })) return { state: 'storage-error' };
        busy = true;
        try {
          var response = await send(payload);
          var result = await response.json();
          // The existing honeypot returns 200 without saving. Only the insert's 201 is confirmed.
          if (response.status === 201 && result.ok === true && referencePattern.test(result.reference)) {
            var receipt = { state: 'confirmed', reference: result.reference };
            return { state: 'confirmed', reference: result.reference, persisted: write(receipt) };
          }
          if ([400, 403, 413, 422, 429].includes(response.status)) {
            storage.removeItem(key);
            return { state: 'invalid' };
          }
        } catch (_) { /* A lost response cannot establish whether the server saved the inquiry. */ }
        finally { busy = false; }
        write({ state: 'unknown' });
        return { state: 'unknown' };
      }
    };
  }
  function mount(form, endpoint, publicKey) {
    var storage;
    try { storage = window.sessionStorage; } catch (_) { storage = null; }
    var flow = create(storage, function (payload) {
      return fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + publicKey, apikey: publicKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(30000)
      });
    });
    var button = form.querySelector('[type="submit"]');
    var status = form.querySelector('[data-form-status]');
    var started = form.querySelector('[name="started_at"]');
    started.value = String(Date.now());
    function display(state, reference) {
      status.className = 'form-status ' + (state === 'confirmed' ? 'success' : 'error');
      if (state === 'confirmed') {
        status.textContent = '접수되었습니다. 접수번호: ' + reference + ' ';
        var link = document.createElement('a');
        link.href = './inquiry-complete.html'; link.textContent = '접수 확인 보기'; status.appendChild(link);
      } else if (state === 'unknown' || state === 'pending' || state === 'blocked') {
        status.textContent = '이 탭에서 보낸 문의의 접수 여부를 확인할 수 없습니다. 중복 접수를 피하려고 재전송을 멈췄습니다. 위 메일 문의로 기존 접수 여부를 확인해 주세요.';
      } else if (state === 'storage-error') {
        status.textContent = '브라우저의 임시 접수 상태를 보관할 수 없어 전송하지 않았습니다. 세션 저장을 허용하거나 위 메일 문의를 이용해 주세요.';
      } else {
        status.textContent = '접수되지 않았습니다. 입력 내용과 동의를 확인해 주세요. 잠시 후 다시 시도하거나 위 메일 문의를 이용하실 수 있습니다.';
      }
    }
    var previous = flow.receipt();
    if (previous) { button.disabled = true; display(previous.state, previous.reference); }
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      var data = new FormData(form);
      var payload = { name: String(data.get('name') || '').trim(), contact: String(data.get('contact') || '').trim(), inquiry_type: String(data.get('inquiry_type') || ''), message: String(data.get('message') || '').trim(), privacy_consent: data.get('privacy_consent') === 'on', website: String(data.get('website') || ''), started_at: Number(data.get('started_at')) };
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      form.setAttribute('aria-busy', 'true'); status.className = 'form-status'; status.textContent = '문의를 안전하게 접수하고 있습니다…';
      var result = await flow.submit(payload);
      button.removeAttribute('aria-busy'); form.removeAttribute('aria-busy');
      if (result.state === 'confirmed') {
        display(result.state, result.reference);
        if (result.persisted) window.location.assign('./inquiry-complete.html');
      } else {
        display(result.state);
        button.disabled = !!flow.receipt();
      }
    });
  }
  return { key: key, read: read, create: create, mount: mount };
});
