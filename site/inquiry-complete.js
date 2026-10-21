(function () {
  'use strict';
  var storage;
  try { storage = window.sessionStorage; } catch (_) { storage = null; }
  var receipt = HaruInquiry.read(storage);
  if (receipt && receipt.state === 'confirmed') {
    document.querySelector('[data-receipt-title]').textContent = '문의가 접수되었습니다.';
    document.querySelector('[data-receipt-message]').textContent = '접수번호: ' + receipt.reference + ' · 확인 후 연락드리겠습니다. 이 화면을 새로고침해도 문의가 다시 전송되지 않습니다.';
    document.querySelector('[data-new-inquiry]').hidden = false;
  }
  document.querySelector('[data-new-inquiry]').addEventListener('click', function () {
    try { storage.removeItem(HaruInquiry.key); window.location.assign('./index.html#contact'); } catch (_) {}
  });
})();
