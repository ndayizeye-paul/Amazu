/* Amazu fx: inzu ya 3D, amakarita ya 3D, animations zo kugaragara, kubara imibare, guhinduranya paji. */
(function () {
  'use strict';
  window.__fx = 1;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- 1. Inzu ya 3D: izenguruka yonyine, ushobora kuyizunguza urutoki/imbeba ---------- */
  (function house() {
    var scene = $('#scene'), orbit = $('#orbit'), stage = $('#stage');
    if (!scene || !orbit || !stage) return;
    var angle = 28, rx = -16, vel = 0, drag = false, lastX = 0, lastY = 0, auto = 0.22, raf = 0, visible = true, tgtRx = -16;
    function paint() {
      orbit.style.setProperty('--ry', angle.toFixed(2) + 'deg');
      stage.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    }
    paint();
    if (reduce) return;
    function frame() {
      raf = 0;
      if (!visible || document.hidden) return;
      if (!drag) { angle += auto + vel; vel *= 0.94; if (Math.abs(vel) < 0.01) vel = 0; }
      rx += (tgtRx - rx) * 0.08;
      paint();
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    scene.addEventListener('pointerdown', function (e) {
      drag = true; lastX = e.clientX; lastY = e.clientY; scene.classList.add('drag');
      try { scene.setPointerCapture(e.pointerId); } catch (x) {}
    });
    scene.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
        angle += dx * 0.6; vel = dx * 0.25; tgtRx = clamp(tgtRx + dy * 0.15, -34, -4);
      } else if (fine) {
        var r = scene.getBoundingClientRect();
        tgtRx = -16 + ((e.clientY - r.top) / r.height - 0.5) * -14;
      }
    });
    function up() { drag = false; scene.classList.remove('drag'); tgtRx = -16; }
    scene.addEventListener('pointerup', up);
    scene.addEventListener('pointercancel', up);
    scene.addEventListener('pointerleave', function () { if (!drag) tgtRx = -16; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) kick(); }).observe(scene);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
    kick();
  })();

  /* ---------- 2. Amakarita ya 3D (tilt + urumuri) ---------- */
  (function tilt() {
    var items = $$('.lcard, .chip, .stats > div');
    if (!items.length) return;
    items.forEach(function (el) {
      el.classList.add('tilt');
      if (reduce) return;
      if (fine) {
        el.addEventListener('pointerenter', function () { el.classList.add('hot'); });
        el.addEventListener('pointermove', function (e) {
          var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          el.style.setProperty('--tx', ((0.5 - py) * 9).toFixed(2) + 'deg');
          el.style.setProperty('--ty', ((px - 0.5) * 11).toFixed(2) + 'deg');
          el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
          el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        });
        el.addEventListener('pointerleave', function () {
          el.style.setProperty('--tx', '0deg'); el.style.setProperty('--ty', '0deg');
          setTimeout(function () { if (!el.matches(':hover')) el.classList.remove('hot'); }, 200);
        });
      } else {
        el.addEventListener('pointerdown', function () { el.classList.add('press'); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
          el.addEventListener(n, function () { el.classList.remove('press'); });
        });
      }
    });
  })();

  /* ---------- 3. Kugaragara buhoro buhoro iyo ugeze ku gice ---------- */
  (function reveal() {
    var targets = $$('.reveal, .lgrid > *, .chips > *, .steps > li, .rows > *, .stats > *, .maplist > *');
    if (!targets.length) return;
    if (reduce || !('IntersectionObserver' in window)) { targets.forEach(function (t) { t.classList.add('in'); }); return; }
    targets.forEach(function (t, i) {
      t.classList.add('rv');
      var sib = t.parentElement ? Array.prototype.indexOf.call(t.parentElement.children, t) : 0;
      t.style.setProperty('--d', (Math.min(sib, 8) * 70) + 'ms');
    });
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        var t = e.target; t.classList.add('in'); io.unobserve(t);
        /* animation irangiye, nkuraho ibiranga kugira ngo tilt n'ibindi bikore */
        setTimeout(function () { t.classList.remove('rv', 'in'); t.style.removeProperty('--d'); }, 900 + (parseInt(t.style.getPropertyValue('--d'), 10) || 0));
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (t) { io.observe(t); });
    /* ibyongeweho nyuma (urugero ikarita) bigaragara bisanzwe */
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.parentElement && /maplist/.test(n.parentElement.className)) { n.classList.add('rv'); requestAnimationFrame(function () { n.classList.add('in'); setTimeout(function () { n.classList.remove('rv', 'in'); }, 900); }); } }); });
    }).observe(document.body, { childList: true, subtree: true });
  })();

  /* ---------- 4. Imibare irazamuka ---------- */
  (function counters() {
    var els = $$('.chip b, .stats b').filter(function (e) { return /^\d+$/.test(e.textContent.trim()); });
    if (!els.length || reduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return; io.unobserve(e.target);
        var el = e.target, to = parseInt(el.textContent, 10), t0 = performance.now(), dur = 900;
        function step(t) { var p = clamp((t - t0) / dur, 0, 1), v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = v; if (p < 1) requestAnimationFrame(step); }
        el.textContent = '0'; requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ---------- 5. Imisozi n'izuba bigenda buhoro iyo uzunguye paji ---------- */
  (function parallax() {
    var hills = $('.hero .hills'); if (!hills || reduce) return;
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { hills.style.transform = 'translateY(' + Math.min(window.scrollY * 0.12, 40).toFixed(1) + 'px)'; ticking = false; });
    }, { passive: true });
  })();

  /* ---------- 6. Guhinduranya paji neza ---------- */
  (function pages() {
    if (reduce) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download') || a.origin !== location.origin) return;
      if (a.pathname === location.pathname && a.search === location.search) return;
      if (/^\/(uploads|static)\//.test(a.pathname)) return;
      e.preventDefault();
      document.body.classList.add('leaving');
      setTimeout(function () { location.href = a.href; }, 150);
    });
    window.addEventListener('pageshow', function () { document.body.classList.remove('leaving'); });
  })();
})();
