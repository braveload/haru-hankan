(function () {
  'use strict';
  var bar = document.querySelector('[data-mobile-inquiry]');
  var target = document.querySelector('[data-inquiry-form]') || document.querySelector('#contact');
  if (!bar || !target) return;
  var visible = false;
  var initialHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  function update() {
    var fieldFocused = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    var keyboard = window.visualViewport && initialHeight - window.visualViewport.height > 150;
    bar.hidden = visible || fieldFocused || keyboard;
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; update(); }).observe(target);
  } else {
    window.addEventListener('scroll', function () { var r = target.getBoundingClientRect(); visible = r.top < window.innerHeight && r.bottom > 0; update(); }, { passive: true });
  }
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', function () { setTimeout(update, 0); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
  update();
})();
