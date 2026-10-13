/* Paji y'ikarita: amazu yose, no gushaka ari hafi y'aho uri. */
(function () {
  'use strict';
  var root = document.getElementById('map');
  if (!root) return;
  var logged = root.dataset.logged === '1';
  var map = new AmazuMap(root, { center: [-1.9441, 30.0619], zoom: 12 });
  var listEl = document.getElementById('list');
  var statusEl = document.getElementById('status');
  var btn = document.getElementById('locate');
  var items = [], meMarker = null, meLL = null;

  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle('bad', !!bad); }
  function km(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtDist(d) { return d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(d < 10 ? 1 : 0).replace('.', ',') + ' km'; }
  function short(p) { return p >= 1e6 ? (p / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : Math.round(p / 1000) + 'k'; }
  function rwf(p) { return String(p).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' RWF'; }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function pinEl(it) {
    var b = mk('button', 'am-pin'); b.type = 'button';
    b.setAttribute('aria-label', it.title + ', ' + rwf(it.price));
    b.appendChild(mk('span', null, short(it.price)));
    return b;
  }
  function popupFor(it) {
    var d = mk('div', 'mp');
    if (it.cover) { var im = new Image(); im.src = it.cover; im.alt = ''; d.appendChild(im); }
    var b = mk('div', 'mp-b');
    b.appendChild(mk('strong', null, rwf(it.price) + ' /ukwezi'));
    b.appendChild(mk('div', 'mp-t', it.title));
    b.appendChild(mk('div', 'mp-l', it.location + ', ' + it.city + (it.dist != null ? ' · ' + fmtDist(it.dist) : '')));
    var a = mk('a', 'btn btn-sm', logged ? 'Reba inzu' : 'Injira urebe inzu');
    a.href = it.url;
    b.appendChild(a);
    d.appendChild(b);
    return d;
  }
  function focusItem(it, zoomIn) {
    if (zoomIn) map.setView([it.lat, it.lng], Math.max(map.getZoom(), 15));
    map.openPopup(it.lat, it.lng, popupFor(it), { offset: -40 });
  }

  function renderList() {
    listEl.textContent = '';
    if (!items.length) {
      var e = mk('div', 'empty small');
      e.appendChild(mk('h3', null, 'Nta nzu iri ku ikarita'));
      e.appendChild(mk('p', null, 'Amazu azagaragara hano igihe banyirinzu bazaba bashyizeho aho aherereye.'));
      listEl.appendChild(e);
      return;
    }
    items.forEach(function (it, i) {
      var row = mk('button', 'nrow'); row.type = 'button';
      var th = mk('span', 'nthumb');
      if (it.cover) { var im = new Image(); im.src = it.cover; im.alt = ''; im.loading = 'lazy'; th.appendChild(im); }
      var tx = mk('span', 'ntext');
      tx.appendChild(mk('strong', null, it.title));
      tx.appendChild(mk('span', 'muted', it.location + ', ' + it.city));
      tx.appendChild(mk('span', 'nprice', rwf(it.price) + ' /ukwezi'));
      row.append(th, tx);
      if (it.dist != null) {
        var side = mk('span', 'ndist');
        side.appendChild(mk('b', null, fmtDist(it.dist)));
        if (i === 0) side.appendChild(mk('em', null, 'Iri hafi cyane'));
        row.appendChild(side);
      }
      row.addEventListener('click', function () { focusItem(it, true); });
      listEl.appendChild(row);
    });
  }

  function load() {
    setStatus('Turimo gushaka amazu...');
    fetch(root.dataset.api, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        items = d.items || [];
        items.forEach(function (it) {
          it.marker = map.addMarker({ lat: it.lat, lng: it.lng, el: pinEl(it), onClick: function () { focusItem(it, false); } });
        });
        renderList();
        if (items.length) {
          map.fitBounds(items.map(function (i) { return [i.lat, i.lng]; }));
          setStatus(items.length + (items.length === 1 ? ' inzu iri' : ' amazu ari') + ' ku ikarita. Kanda "Shaka hafi yanjye" urebe akwegereye.');
        } else setStatus('Nta nzu iragira aho iri ku ikarita.');
        if (root.dataset.near === '1') locate();
      })
      .catch(function () { setStatus('Ntitwabashije kubona amazu. Ongera ugerageze.', true); });
  }

  function locate() {
    if (!navigator.geolocation) { setStatus('Browser yawe ntishobora kumenya aho uri.', true); return; }
    btn.disabled = true;
    setStatus('Turimo gushaka aho uri...');
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.disabled = false;
      meLL = [pos.coords.latitude, pos.coords.longitude];
      if (meMarker) meMarker.setLatLng(meLL[0], meLL[1]);
      else { var dot = mk('span', 'am-me'); dot.setAttribute('aria-label', 'Aho uri'); meMarker = map.addMarker({ lat: meLL[0], lng: meLL[1], el: dot }); }
      items.forEach(function (it) { it.dist = km(meLL, [it.lat, it.lng]); });
      items.sort(function (a, b) { return a.dist - b.dist; });
      renderList();
      if (!items.length) { map.setView(meLL, 15); setStatus('Aho uri harabonetse, ariko nta nzu iragira aho iri ku ikarita.'); return; }
      map.fitBounds([meLL].concat(items.slice(0, 3).map(function (i) { return [i.lat, i.lng]; })), 70);
      focusItem(items[0], false);
      setStatus('Iyikwegereye cyane ni "' + items[0].title + '", iri kuri ' + fmtDist(items[0].dist) + ' uvuye aho uri.');
    }, function (err) {
      btn.disabled = false;
      var m = { 1: 'Wanze ko tumenya aho uri. Emera "Location" kuri browser yawe, hanyuma ugerageze.',
                2: 'Ntitwabashije kumenya aho uri. Ongera ugerageze.',
                3: 'Byatwaye igihe kinini. Ongera ugerageze.' };
      setStatus(m[err.code] || m[2], true);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  btn.addEventListener('click', locate);
  map.on('click', function () { map.closePopup(); });
  load();
})();
