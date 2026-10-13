/* Ifishi y'inzu: hitamo aho inzu iri. Ikarita ntoya ni "preview"; iyo ukandaho ifunguka nini. */
(function () {
  'use strict';
  var root = document.getElementById('pick'); if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var latI = $('lat'), lngI = $('lng'), stat = $('pickstat'), clear = $('pickclear'), here = $('pickhere');
  var openBtn = $('pickopen'), cta = $('pickcta');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KIGALI = [-1.9441, 30.0619], MINZ_OK = 16;
  var OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var OSM_ATTR = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
  var SAT_ATTR = 'Tiles © Esri, Maxar, Earthstar Geographics';

  function houseEl() {
    var s = document.createElement('span'); s.className = 'am-house';
    s.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V20H4z"/></svg>';
    return s;
  }

  /* ---------- Ikarita ntoya (preview) ---------- */
  var lat0 = parseFloat(latI.value), lng0 = parseFloat(lngI.value), has = isFinite(lat0) && isFinite(lng0);
  var small = new AmazuMap(root, { center: has ? [lat0, lng0] : KIGALI, zoom: has ? 16 : 12, wheel: false });
  root.tabIndex = -1; root.removeAttribute('role');
  var marker = null, cur = has ? { lat: lat0, lng: lng0 } : null;
  function paintSmall() {
    if (cur) {
      latI.value = cur.lat.toFixed(6); lngI.value = cur.lng.toFixed(6);
      if (marker) marker.setLatLng(cur.lat, cur.lng); else marker = small.addMarker({ lat: cur.lat, lng: cur.lng, el: houseEl() });
      small.setView([cur.lat, cur.lng], 16);
      stat.textContent = 'Aho inzu iri: ' + cur.lat.toFixed(5) + ', ' + cur.lng.toFixed(5);
      clear.hidden = false; cta.textContent = 'Kanda uhindure aho inzu iri';
    } else {
      if (marker) { marker.remove(); marker = null; }
      latI.value = ''; lngI.value = '';
      stat.textContent = 'Nta hantu uhitamo. Inzu ntizagaragara ku ikarita.';
      clear.hidden = true; cta.textContent = 'Kanda ushyireho aho inzu iri';
    }
  }
  paintSmall();

  /* ---------- Ikarita nini ---------- */
  var pm = $('pm'), pmEl = $('pmmap'), big = null, bigMarker = null, opener = null, sat = false, moveT = 0, tween = 0;
  var coords = $('pmcoords'), zoomEl = $('pmzoom'), ok = $('pmok'), hint = $('pmhint'), pin = $('pmpin');

  function updateReadout() {
    var c = big.getCenter(), z = big.getZoom(), good = z >= MINZ_OK;
    coords.textContent = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6);
    zoomEl.textContent = good ? 'Zoom ' + z + ': neza' : 'Zoom ' + z;
    ok.disabled = !good; ok.classList.toggle('disabled', !good);
    hint.textContent = good ? 'Urushinge rwo hagati ni rwo ruzaba aho inzu iri. Yobora ikarita kugeza rurebye ku nzu yawe.'
                            : 'Sunika ikarita hafi (kanda +) kugira ngo ubone neza inzu yawe.';
    hint.classList.toggle('warn', !good);
  }
  function onMove() {
    pin.classList.add('lift'); clearTimeout(moveT); moveT = setTimeout(function () { pin.classList.remove('lift'); }, 140);
    updateReadout();
  }
  function fly(lat, lng, zoom) {
    cancelAnimationFrame(tween);
    if (zoom != null && zoom !== big.getZoom()) { big.setView([lat, lng], zoom); return; }
    if (reduce) { big.setView([lat, lng]); return; }
    var from = big.latLngToPoint(big.getCenter().lat, big.getCenter().lng), to = big.latLngToPoint(lat, lng);
    var dx = to.x - from.x, dy = to.y - from.y, t0 = performance.now(), dur = 260, done = 0;
    function step(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3), want = e;
      big.panBy((dx * (want - done)), (dy * (want - done))); done = want;
      if (p < 1) tween = requestAnimationFrame(step);
    }
    tween = requestAnimationFrame(step);
  }
  function setSat(on) {
    sat = on; $('pmsat').setAttribute('aria-pressed', on ? 'true' : 'false');
    pmEl.classList.toggle('am-sat', on);
    big.setTiles(on ? SAT : OSM, on ? SAT_ATTR : OSM_ATTR);
  }
  function focusables() { return [].slice.call(pm.querySelectorAll('button:not([disabled]),input,[tabindex="0"]')).filter(function (e) { return e.offsetParent !== null; }); }

  function openBig(center) {
    opener = document.activeElement; pm.hidden = false; document.body.classList.add('noscroll');
    var c = center || (cur ? [cur.lat, cur.lng] : [small.getCenter().lat, small.getCenter().lng]);
    if (!big) {
      big = new AmazuMap(pmEl, { center: c, zoom: cur ? 18 : 15, maxZoom: 19, wheel: true });
      big.on('move', onMove);
      big.on('click', function (ll) { fly(ll.lat, ll.lng); });   /* kanda ahantu: ikarita igaruka aho ngaho hagati */
      pmEl.addEventListener('pointerdown', function () { pin.classList.add('lift'); });
    } else {
      big.invalidateSize(); big.setView(c, cur ? Math.max(big.getZoom(), 17) : big.getZoom());
    }
    if (bigMarker) { bigMarker.remove(); bigMarker = null; }
    if (cur) bigMarker = big.addMarker({ lat: cur.lat, lng: cur.lng, el: (function () { var d = document.createElement('span'); d.className = 'pm-old'; d.title = 'Aho wahisemo mbere'; return d; })() });
    updateReadout(); big.root.focus({ preventScroll: true });
  }
  function closeBig() {
    pm.hidden = true; document.body.classList.remove('noscroll'); $('pmres').hidden = true;
    if (opener && opener.focus) opener.focus();
  }
  function confirm() {
    if (ok.disabled) return;
    var c = big.getCenter(); cur = { lat: c.lat, lng: c.lng }; paintSmall(); closeBig();
  }

  openBtn.addEventListener('click', function () { openBig(); });
  here.addEventListener('click', function () {
    if (!navigator.geolocation) { stat.textContent = 'Browser yawe ntishobora kumenya aho uri.'; return; }
    stat.textContent = 'Turimo gushaka aho uri...';
    navigator.geolocation.getCurrentPosition(function (p) { cur = { lat: p.coords.latitude, lng: p.coords.longitude }; paintSmall(); openBig([cur.lat, cur.lng]); },
      function () { stat.textContent = 'Ntitwabashije kumenya aho uri. Kanda ku ikarita ahari inzu.'; },
      { enableHighAccuracy: true, timeout: 12000 });
  });
  clear.addEventListener('click', function () { cur = null; paintSmall(); });
  $('pmclose').addEventListener('click', closeBig);
  ok.addEventListener('click', confirm);
  $('pmsat').addEventListener('click', function () { setSat(!sat); });
  $('pmlocate').addEventListener('click', function () {
    if (!navigator.geolocation) { hint.textContent = 'Browser yawe ntishobora kumenya aho uri.'; return; }
    hint.textContent = 'Turimo gushaka aho uri...'; hint.classList.remove('warn');
    navigator.geolocation.getCurrentPosition(function (p) { big.setView([p.coords.latitude, p.coords.longitude], 18); },
      function () { hint.textContent = 'Ntitwabashije kumenya aho uri. Wemerera browser cyangwa ushakishe agace.'; hint.classList.add('warn'); },
      { enableHighAccuracy: true, timeout: 12000 });
  });

  /* Gushakisha ahantu (OpenStreetMap Nominatim) */
  var res = $('pmres');
  $('pmsearch').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('pmq').value.trim(); if (q.length < 2) return;
    res.textContent = ''; res.hidden = false;
    var li = document.createElement('li'); li.className = 'pm-msg'; li.textContent = 'Turashakisha...'; res.appendChild(li);
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=rw&accept-language=rw,en,fr&q=' + encodeURIComponent(q))
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (list) {
        res.textContent = '';
        if (!list.length) { var n = document.createElement('li'); n.className = 'pm-msg'; n.textContent = 'Nta kintu cyabonetse. Gerageza irindi zina.'; res.appendChild(n); return; }
        list.forEach(function (it) {
          var la = parseFloat(it.lat), lo = parseFloat(it.lon); if (!isFinite(la) || !isFinite(lo)) return;
          var item = document.createElement('li'), b = document.createElement('button');
          b.type = 'button'; b.textContent = String(it.display_name || '').slice(0, 110);
          b.addEventListener('click', function () { res.hidden = true; big.setView([la, lo], 17); big.root.focus({ preventScroll: true }); });
          item.appendChild(b); res.appendChild(item);
        });
      })
      .catch(function () { res.textContent = ''; var n = document.createElement('li'); n.className = 'pm-msg'; n.textContent = 'Gushakisha ntibyashobotse (nta internet?). Yobora ikarita ukoresheje urutoki.'; res.appendChild(n); });
  });

  pm.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); if (!res.hidden) res.hidden = true; else closeBig(); return; }
    if (e.key === 'Enter' && e.target === pmEl) { e.preventDefault(); confirm(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(); if (!f.length) return;
    var first = f[0], lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  });
  /* Kudatakaza ifishi iyo ukandira Enter mu gushakisha */
  $('pmq').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.stopPropagation(); });
})();
