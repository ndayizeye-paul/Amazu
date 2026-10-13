/* AmazuMap: ikarita yoroheje ikoresha tiles za OpenStreetMap. Nta library y'inyongera ikenewe. */
(function (global) {
  'use strict';
  var TILE = 256, MAXLAT = 85.0511287798;
  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  function worldSize(z) { return TILE * Math.pow(2, z); }
  function project(lat, lng, z) {
    var s = worldSize(z);
    lat = Math.max(-MAXLAT, Math.min(MAXLAT, lat));
    var sin = Math.sin(lat * Math.PI / 180);
    return { x: (lng + 180) / 360 * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
  }
  function unproject(x, y, z) {
    var s = worldSize(z), n = Math.PI - 2 * Math.PI * y / s;
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: x / s * 360 - 180 };
  }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  function AmazuMap(root, opts) {
    opts = opts || {};
    var self = this;
    this.root = root;
    this.minZoom = opts.minZoom || 3;
    this.maxZoom = opts.maxZoom || 18;
    this.tileUrl = opts.tileUrl || TILE_URL;
    this.wheel = opts.wheel !== false;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, opts.zoom || 12));
    this.handlers = {};
    this.markers = [];
    this.tiles = {};
    this.popup = null;
    this._wheelT = 0;
    this._dragged = false;

    root.classList.add('am-map');
    if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
    root.setAttribute('role', 'application');
    this.tilePane = el('div', 'am-tiles');
    this.markerPane = el('div', 'am-markers');
    this.popupPane = el('div', 'am-popups');
    root.append(this.tilePane, this.markerPane, this.popupPane);

    var ctl = el('div', 'am-ctl');
    var zin = el('button'), zout = el('button');
    zin.type = zout.type = 'button';
    zin.textContent = '+'; zout.textContent = '−';
    zin.setAttribute('aria-label', 'Kuza ikarita'); zout.setAttribute('aria-label', 'Gabanya ikarita');
    zin.addEventListener('click', function () { self.zoomAt(1); });
    zout.addEventListener('click', function () { self.zoomAt(-1); });
    ctl.append(zin, zout);
    var attr = el('div', 'am-attr');
    attr.innerHTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
    this.attrEl = attr;
    root.append(ctl, attr);

    this._size();
    var c = project((opts.center || [-1.9441, 30.0619])[0], (opts.center || [-1.9441, 30.0619])[1], this.zoom);
    this.cx = c.x; this.cy = c.y;
    this._bind();
    this._render();
    if (global.ResizeObserver) new ResizeObserver(function () { self.invalidateSize(); }).observe(root);
    else global.addEventListener('resize', function () { self.invalidateSize(); });
  }

  var P = AmazuMap.prototype;

  P.on = function (name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); return this; };
  P.emit = function (name, data) { (this.handlers[name] || []).forEach(function (f) { f(data); }); };
  P._size = function () { this.w = this.root.clientWidth || 300; this.h = this.root.clientHeight || 300; };
  P.invalidateSize = function () { this._size(); this._clamp(); this._render(); };
  P.getZoom = function () { return this.zoom; };
  P.getCenter = function () { return unproject(this.cx, this.cy, this.zoom); };

  P._clamp = function () {
    var s = worldSize(this.zoom);
    this.cy = s <= this.h ? s / 2 : Math.max(this.h / 2, Math.min(s - this.h / 2, this.cy));
    this.cx = ((this.cx % s) + s) % s;
  };
  P.latLngToPoint = function (lat, lng) {
    var p = project(lat, lng, this.zoom);
    return { x: p.x - (this.cx - this.w / 2), y: p.y - (this.cy - this.h / 2) };
  };
  P.pointToLatLng = function (x, y) { return unproject(this.cx - this.w / 2 + x, this.cy - this.h / 2 + y, this.zoom); };

  P.setView = function (ll, zoom) {
    if (zoom != null) this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    var p = project(ll[0], ll[1], this.zoom);
    this.cx = p.x; this.cy = p.y;
    this._clamp(); this._render();
  };
  P.panBy = function (dx, dy) { this.cx += dx; this.cy += dy; this._clamp(); this._render(); };
  P.zoomAt = function (delta, px, py) {
    var z = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));
    if (z === this.zoom) return;
    if (px == null) { px = this.w / 2; py = this.h / 2; }
    var ll = this.pointToLatLng(px, py);
    this.zoom = z;
    var p = project(ll.lat, ll.lng, z);
    this.cx = p.x - (px - this.w / 2);
    this.cy = p.y - (py - this.h / 2);
    this._clamp(); this._render();
  };
  P.fitBounds = function (pts, pad) {
    if (!pts || !pts.length) return;
    pad = pad == null ? 48 : pad;
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    pts.forEach(function (p) {
      minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]);
      minLng = Math.min(minLng, p[1]); maxLng = Math.max(maxLng, p[1]);
    });
    var z = Math.min(this.maxZoom, 17);
    for (; z > this.minZoom; z--) {
      var a = project(maxLat, minLng, z), b = project(minLat, maxLng, z);
      if (b.x - a.x <= this.w - 2 * pad && b.y - a.y <= this.h - 2 * pad) break;
    }
    this.setView([(minLat + maxLat) / 2, (minLng + maxLng) / 2], z);
  };

  /* Markers */
  P.addMarker = function (o) {
    var self = this, wrap = el('div', 'am-mk');
    wrap.appendChild(o.el);
    var m = { lat: o.lat, lng: o.lng, wrap: wrap,
      remove: function () { wrap.remove(); self.markers = self.markers.filter(function (x) { return x !== m; }); },
      setLatLng: function (lat, lng) { m.lat = lat; m.lng = lng; self._place(m); } };
    wrap.addEventListener('click', function (e) { e.stopPropagation(); if (o.onClick) o.onClick(m, e); });
    this.markers.push(m);
    this.markerPane.appendChild(wrap);
    this._place(m);
    return m;
  };
  P._place = function (m) {
    var p = this.latLngToPoint(m.lat, m.lng);
    m.wrap.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
    m.wrap.style.zIndex = Math.round(p.y);
  };

  /* Popup */
  P.openPopup = function (lat, lng, content, o) {
    var self = this;
    this.closePopup(true);
    var pop = el('div', 'am-popup'), box = el('div', 'am-pbox'), close = el('button', 'am-x');
    close.type = 'button'; close.setAttribute('aria-label', 'Funga'); close.textContent = '×';
    close.addEventListener('click', function () { self.closePopup(); });
    box.append(close, content);
    pop.appendChild(box);
    ['pointerdown', 'wheel', 'dblclick', 'click'].forEach(function (t) {
      box.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
    });
    this.popupPane.appendChild(pop);
    this.popup = { lat: lat, lng: lng, el: pop, offset: (o && o.offset) || 0 };
    this._placePopup();
    var r = box.getBoundingClientRect(), mr = this.root.getBoundingClientRect(), pad = 12, dx = 0, dy = 0;
    if (r.top - mr.top < pad) dy = r.top - mr.top - pad;
    if (r.left - mr.left < pad) dx = r.left - mr.left - pad;
    else if (r.right > mr.right - pad) dx = r.right - mr.right + pad;
    if (dx || dy) this.panBy(dx, dy);
  };
  P._placePopup = function () {
    if (!this.popup) return;
    var p = this.latLngToPoint(this.popup.lat, this.popup.lng);
    this.popup.el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y + this.popup.offset) + 'px)';
  };
  P.closePopup = function (silent) {
    if (!this.popup) return;
    this.popup.el.remove(); this.popup = null;
    if (!silent) this.emit('popupclose');
  };

  /* Hindura ubwoko bw'ikarita (urugero satellite). attrHtml ni inyandiko ihamye yacu, ntiva ku mukoresha. */
  P.setTiles = function (url, attrHtml) {
    this.tileUrl = url || TILE_URL;
    for (var k in this.tiles) { this.tiles[k].remove(); }
    this.tiles = {};
    if (attrHtml != null) this.attrEl.innerHTML = attrHtml;
    this._render();
  };

  /* Render */
  P._render = function () {
    var z = this.zoom, n = Math.pow(2, z), left = this.cx - this.w / 2, top = this.cy - this.h / 2;
    var x0 = Math.floor(left / TILE), x1 = Math.floor((left + this.w) / TILE);
    var y0 = Math.floor(top / TILE), y1 = Math.floor((top + this.h) / TILE);
    var need = {}, tx, ty;
    for (tx = x0; tx <= x1; tx++) {
      for (ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        var key = z + '/' + tx + '/' + ty, im = this.tiles[key];
        if (!im) {
          im = new Image();
          im.className = 'am-tile'; im.alt = ''; im.draggable = false; im.decoding = 'async';
          im.src = this.tileUrl.replace('{z}', z).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty);
          this.tilePane.appendChild(im);
          this.tiles[key] = im;
        }
        im.style.transform = 'translate(' + Math.round(tx * TILE - left) + 'px,' + Math.round(ty * TILE - top) + 'px)';
        need[key] = true;
      }
    }
    for (var k in this.tiles) {
      if (!need[k]) { this.tiles[k].remove(); delete this.tiles[k]; }
    }
    for (var i = 0; i < this.markers.length; i++) this._place(this.markers[i]);
    this._placePopup();
    this.emit('move');
  };

  /* Interaction */
  P._bind = function () {
    var self = this, root = this.root, pointers = {}, drag = null, pinch = null;
    function skip(t) { return t.closest && t.closest('.am-ctl,.am-popup'); }
    function count() { return Object.keys(pointers).length; }
    function dist() { var a = Object.keys(pointers).map(function (k) { return pointers[k]; });
      return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }

    root.addEventListener('pointerdown', function (e) {
      if (skip(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() === 1) drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
      else if (count() === 2) { drag = null; pinch = dist(); }
    });
    root.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch && count() === 2) {
        var cur = dist(), ratio = cur.d / pinch.d, r = root.getBoundingClientRect();
        if (ratio > 1.45) { self.zoomAt(1, cur.x - r.left, cur.y - r.top); pinch.d = cur.d; self._dragged = true; }
        else if (ratio < 0.69) { self.zoomAt(-1, cur.x - r.left, cur.y - r.top); pinch.d = cur.d; self._dragged = true; }
      } else if (drag && drag.id === e.pointerId) {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) {
          drag.moved = true;
          try { root.setPointerCapture(e.pointerId); } catch (err) {}
          root.classList.add('am-drag');
        }
        if (drag.moved) {
          self.panBy(-(e.clientX - drag.lx), -(e.clientY - drag.ly));
          drag.lx = e.clientX; drag.ly = e.clientY;
        }
      }
    });
    function up(e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId];
      if (drag && drag.id === e.pointerId) {
        if (drag.moved) {
          self._dragged = true;
          setTimeout(function () { self._dragged = false; }, 60);
          try { root.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        drag = null;
      }
      if (count() < 2) { if (pinch) setTimeout(function () { self._dragged = false; }, 60); pinch = null; }
      root.classList.remove('am-drag');
    }
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);

    root.addEventListener('click', function (e) {
      if (self._dragged || skip(e.target) || (e.target.closest && e.target.closest('.am-mk'))) return;
      var r = root.getBoundingClientRect(), ll = self.pointToLatLng(e.clientX - r.left, e.clientY - r.top);
      self.emit('click', ll);
    });
    root.addEventListener('dblclick', function (e) {
      if (skip(e.target) || (e.target.closest && e.target.closest('.am-mk'))) return;
      var r = root.getBoundingClientRect();
      self.zoomAt(1, e.clientX - r.left, e.clientY - r.top);
    });
    if (this.wheel) root.addEventListener('wheel', function (e) {
      if (skip(e.target)) return;
      e.preventDefault();
      var t = Date.now();
      if (t - self._wheelT < 200) return;
      self._wheelT = t;
      var r = root.getBoundingClientRect();
      self.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    root.addEventListener('keydown', function (e) {
      if (e.target !== root) return;
      var k = e.key, step = 90;
      if (k === 'ArrowLeft') self.panBy(-step, 0);
      else if (k === 'ArrowRight') self.panBy(step, 0);
      else if (k === 'ArrowUp') self.panBy(0, -step);
      else if (k === 'ArrowDown') self.panBy(0, step);
      else if (k === '+' || k === '=') self.zoomAt(1);
      else if (k === '-' || k === '_') self.zoomAt(-1);
      else if (k === 'Escape') self.closePopup();
      else return;
      e.preventDefault();
    });
  };

  global.AmazuMap = AmazuMap;
  global.AmazuMap.project = project;
})(window);
