/* Chat: ubutumwa, ifoto, voice note na dosiye. */
(function () {
  'use strict';
  var root = document.getElementById('chatbox'); if (!root) return;
  var CID = root.dataset.cid, CSRF = root.dataset.csrf;
  var $ = function (id) { return document.getElementById(id); };
  var box = $('msgs'), form = $('form'), input = $('body'), sendBtn = $('sendBtn'), micBtn = $('micBtn');
  var pendingBox = $('pending'), errBox = $('cerr'), recBox = $('rec');
  var last = 0, me = null, first = true, busy = false, pendingFile = null, pendingUrl = null, errT = 0;
  var MAX = { image: 10, audio: 6, file: 10 };
  var DOC_RE = /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i;
  var ICON = {
    play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4.4" height="15" rx="1.2"/><rect x="13.6" y="4.5" width="4.4" height="15" rx="1.2"/></svg>',
    file: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtTime(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function showErr(t) { errBox.textContent = t; errBox.hidden = false; clearTimeout(errT); errT = setTimeout(function () { errBox.hidden = true; }, 6000); }

  /* ---------- Kwerekana ubutumwa ---------- */
  var players = [];
  function stopOthers(except) { players.forEach(function (p) { if (p !== except) p.pause(); }); }
  function audioPlayer(m) {
    var wrap = el('div', 'vplay'), btn = el('button', 'vp-btn'), bar = el('input', 'vp-bar'), time = el('span', 'vp-time', fmtTime(m.dur));
    btn.type = 'button'; btn.innerHTML = ICON.play; btn.setAttribute('aria-label', 'Umva ijwi');
    bar.type = 'range'; bar.min = 0; bar.max = 1000; bar.value = 0; bar.setAttribute('aria-label', 'Aho ijwi ribarizwa');
    var a = new Audio(); a.preload = 'none'; a.src = m.url; players.push(a);
    var total = function () { return m.dur || (isFinite(a.duration) ? a.duration : 0); };
    btn.addEventListener('click', function () {
      if (a.paused) { stopOthers(a); a.play().catch(function () { showErr('Ijwi ntirishoboye gucurangwa.'); }); } else a.pause();
    });
    a.addEventListener('play', function () { btn.innerHTML = ICON.pause; btn.setAttribute('aria-label', 'Hagarika'); });
    a.addEventListener('pause', function () { btn.innerHTML = ICON.play; btn.setAttribute('aria-label', 'Umva ijwi'); });
    a.addEventListener('ended', function () { bar.value = 0; time.textContent = fmtTime(m.dur); btn.innerHTML = ICON.play; });
    a.addEventListener('timeupdate', function () {
      var t = total(); if (t) bar.value = Math.min(1000, a.currentTime / t * 1000);
      time.textContent = fmtTime(a.paused && a.currentTime === 0 ? t : a.currentTime);
    });
    bar.addEventListener('input', function () { var t = total(); if (t) a.currentTime = bar.value / 1000 * t; });
    wrap.append(btn, bar, time);
    return wrap;
  }
  function buildMsg(m, stick) {
    var d = el('div', 'msg ' + (m.sender_id === me ? 'mine' : 'theirs') + (m.kind && m.kind !== 'text' ? ' has-' + m.kind : ''));
    if (m.kind === 'image') {
      var a = el('button', 'att-img'), img = new Image();
      a.type = 'button'; a.setAttribute('aria-label', 'Fungura ifoto nini');
      img.src = m.url; img.alt = m.name || 'Ifoto'; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('load', function () { if (stick) box.scrollTop = box.scrollHeight; });
      a.appendChild(img); a.addEventListener('click', function () { openLightbox(m); });
      d.appendChild(a);
    } else if (m.kind === 'audio') {
      d.appendChild(audioPlayer(m));
    } else if (m.kind === 'file') {
      var f = el('a', 'att-file'); f.href = m.url; f.setAttribute('download', m.name || 'dosiye');
      var ic = el('span', 'af-ic'); ic.innerHTML = ICON.file;
      var tx = el('span', 'af-tx'); tx.append(el('strong', null, m.name || 'Dosiye'), el('small', null, fmtSize(m.size || 0) + ' · Kanda uyikuremo'));
      f.append(ic, tx); d.appendChild(f);
    }
    if (m.body) d.appendChild(el('div', 'msg-body', m.body));
    d.appendChild(el('small', null, m.created_at));
    return d;
  }
  function render(list) {
    var stick = first || box.scrollTop + box.clientHeight >= box.scrollHeight - 60;
    list.forEach(function (m) { last = Math.max(last, m.id); box.appendChild(buildMsg(m, stick)); });
    if (!box.children.length) {
      var p = el('p', 'chat-empty', 'Tangira ikiganiro: baza niba inzu icyahari, cyangwa usabe kuyisura.'); p.id = 'chat-empty'; box.appendChild(p);
    } else if (list.length) { var e = $('chat-empty'); if (e) e.remove(); }
    if (stick) box.scrollTop = box.scrollHeight;
    first = false;
  }
  function poll() {
    if (busy) return;
    fetch('/api/chat/' + CID + '?after=' + last, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) { me = j.me; render(j.messages); } }).catch(function () {});
  }

  /* ---------- Ifoto nini ---------- */
  var lb = $('lightbox'), lbimg = $('lbimg'), lbdl = $('lbdl'), lbFrom = null;
  function openLightbox(m) {
    lbFrom = document.activeElement; lbimg.src = m.url; lbimg.alt = m.name || 'Ifoto'; lbdl.href = m.url + '?dl=1'; lbdl.setAttribute('download', m.name || 'ifoto');
    lb.hidden = false; document.body.classList.add('noscroll'); $('lbclose').focus();
  }
  function closeLightbox() { lb.hidden = true; lbimg.removeAttribute('src'); document.body.classList.remove('noscroll'); if (lbFrom && lbFrom.focus) lbFrom.focus(); }
  $('lbclose').addEventListener('click', closeLightbox);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

  /* ---------- Ibyo ugiye kohereza (ifoto cyangwa dosiye) ---------- */
  function updateUI() {
    var has = !!input.value.trim() || !!pendingFile;
    sendBtn.hidden = !has;
    micBtn.hidden = has || !canRecord;
  }
  function clearPending() {
    if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
    pendingFile = null; pendingBox.hidden = true; pendingBox.textContent = ''; updateUI();
  }
  function setPending(f) {
    if (!f) return;
    var isImg = /^image\/(jpeg|png|webp|gif)$/.test(f.type);
    if (!isImg && !DOC_RE.test(f.name)) { showErr('Ubwoko bwa dosiye ntibwemewe. Wemerewe: ifoto, pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv.'); return; }
    if (f.size > MAX[isImg ? 'image' : 'file'] * 1048576) { showErr((isImg ? 'Ifoto' : 'Dosiye') + ' irenze ' + MAX[isImg ? 'image' : 'file'] + ' MB.'); return; }
    clearPending(); pendingFile = f; pendingBox.textContent = '';
    var item = el('div', 'pend-item');
    if (isImg) { pendingUrl = URL.createObjectURL(f); var im = new Image(); im.src = pendingUrl; im.alt = ''; item.appendChild(im); }
    else { var ic = el('span', 'af-ic'); ic.innerHTML = ICON.file; item.appendChild(ic); }
    var tx = el('span', 'af-tx'); tx.append(el('strong', null, f.name), el('small', null, fmtSize(f.size)));
    var rm = el('button', 'ibtn sm'); rm.type = 'button'; rm.innerHTML = ICON.x; rm.setAttribute('aria-label', 'Kuraho'); rm.addEventListener('click', clearPending);
    item.append(tx, rm); pendingBox.appendChild(item); pendingBox.hidden = false; updateUI(); input.focus();
  }

  var menu = $('attachMenu'), aBtn = $('attachBtn');
  function toggleMenu(open) { menu.hidden = !open; aBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  aBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) toggleMenu(false); });
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pick]'); if (!b) return;
    toggleMenu(false); (b.dataset.pick === 'image' ? $('imgIn') : $('fileIn')).click();
  });
  ['imgIn', 'fileIn'].forEach(function (id) { $(id).addEventListener('change', function () { setPending(this.files[0]); this.value = ''; }); });
  input.addEventListener('input', updateUI);
  input.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.files) || [];
    if (items.length && /^image\//.test(items[0].type)) { e.preventDefault(); setPending(items[0]); }
  });
  ['dragenter', 'dragover'].forEach(function (n) { root.addEventListener(n, function (e) { if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') >= 0) { e.preventDefault(); root.classList.add('dropping'); } }); });
  ['dragleave', 'drop'].forEach(function (n) { root.addEventListener(n, function () { root.classList.remove('dropping'); }); });
  root.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); setPending(e.dataTransfer.files[0]); } });

  /* ---------- Kohereza ---------- */
  function send(opts) {
    if (busy) return; opts = opts || {};
    var body = opts.body != null ? opts.body : input.value.trim(), file = opts.file || pendingFile;
    if (!body && !file) return;
    busy = true; sendBtn.disabled = true; micBtn.disabled = true; errBox.hidden = true;
    var fd = new FormData(); fd.append('body', body); fd.append('csrf_token', CSRF);
    if (file) fd.append('file', file, file.name || 'ijwi'); if (opts.dur != null) fd.append('dur', String(opts.dur));
    var bar = null;
    if (file) { bar = el('div', 'up-bar'); bar.appendChild(el('i')); pendingBox.appendChild(bar); pendingBox.hidden = false; }
    var x = new XMLHttpRequest(); x.open('POST', '/api/chat/' + CID + '?after=' + last); x.setRequestHeader('X-CSRF-Token', CSRF);
    if (bar) x.upload.onprogress = function (e) { if (e.lengthComputable) bar.firstChild.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
    x.onload = function () {
      var j = null; try { j = JSON.parse(x.responseText); } catch (e) {}
      busy = false; sendBtn.disabled = false; micBtn.disabled = false;
      if (x.status === 200 && j) { me = j.me; first = true; input.value = ''; clearPending(); render(j.messages); }
      else { if (bar) bar.remove(); showErr((j && j.message) || 'Ntibyashobotse kohereza. Subira ugerageze.'); updateUI(); }
    };
    x.onerror = function () { busy = false; sendBtn.disabled = false; micBtn.disabled = false; if (bar) bar.remove(); showErr('Nta murongo (internet). Subira ugerageze.'); };
    x.send(fd);
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); send(); });

  /* ---------- Voice note ---------- */
  var canRecord = !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  var rec = null, RMAX = 180;
  function pickMime() {
    var c = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
    for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i];
    return '';
  }
  function setRecUI(on) { recBox.hidden = !on; form.hidden = on; if (!on) updateUI(); }
  function endRec(doSend) {
    if (!rec) return; var r = rec; rec = null; clearInterval(r.timer); r.send = !!doSend;
    try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) {}
    r.stream.getTracks().forEach(function (t) { t.stop(); }); setRecUI(false);
  }
  function startRec() {
    if (rec || busy) return;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      var mime = pickMime(), mr;
      try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); showErr('Browser yawe ntishobora gufata ijwi.'); return; }
      var r = rec = { mr: mr, stream: stream, chunks: [], t0: Date.now(), send: false };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
      mr.onstop = function () {
        var secs = Math.round((Date.now() - r.t0) / 1000);
        if (!r.send) return;
        var type = mr.mimeType || mime || 'audio/webm', blob = new Blob(r.chunks, { type: type });
        if (secs < 1 || blob.size < 600) { showErr('Ijwi ni rigufi cyane. Fata ijwi nibura isegonda rimwe.'); return; }
        if (blob.size > MAX.audio * 1048576) { showErr('Ijwi ririmo ni rirerire cyane.'); return; }
        var ext = /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
        send({ body: '', file: new File([blob], 'ijwi.' + ext, { type: type }), dur: Math.min(secs, 900) });
      };
      mr.start(250); setRecUI(true); $('rectime').textContent = '0:00';
      r.timer = setInterval(function () { var s = (Date.now() - r.t0) / 1000; $('rectime').textContent = fmtTime(s); if (s >= RMAX) endRec(true); }, 250);
    }).catch(function (e) {
      showErr(e && e.name === 'NotAllowedError' ? 'Wemerera microphone muri browser kugira ngo ufate ijwi.' : 'Microphone ntiboneka kuri iki gikoresho.');
    });
  }
  micBtn.addEventListener('click', startRec);
  $('recCancel').addEventListener('click', function () { endRec(false); });
  $('recSend').addEventListener('click', function () { endRec(true); });
  window.addEventListener('pagehide', function () { endRec(false); stopOthers(null); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!lb.hidden) closeLightbox(); else if (!menu.hidden) toggleMenu(false); else if (rec) endRec(false);
  });

  updateUI(); poll(); setInterval(poll, 3000);
})();
