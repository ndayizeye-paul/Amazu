/* Kaze: umufasha w'animation, avuga ibijyanye na paji urimo, akakwereka aho kujya. */
(function () {
  'use strict';
  var box = document.getElementById('kaze'); if (!box) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bub = document.getElementById('kbub'), txt = document.getElementById('ktext'), rep = document.getElementById('kreplies');
  var chr = document.getElementById('kchar'), dot = document.getElementById('kdot');
  var page = document.body.dataset.page || '', name = (document.body.dataset.name || '').trim(), role = document.body.dataset.role || '';
  var $ = function (s) { return document.querySelector(s); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- Ijwi: speechSynthesis ya browser. Kinyarwanda (rw) niba ihari, ubundi Kiswahili (sw) nk'ikiri hafi. ---------- */
  var synth = window.speechSynthesis, canTalk = !!(synth && window.SpeechSynthesisUtterance);
  var vbtn = document.getElementById('kvoice'), knote = document.getElementById('knote');
  var voiceOn = store.get('kaze-voice') !== 'off', speaking = false, typingOn = false, lastText = '';
  function activated() { return !navigator.userActivation || navigator.userActivation.hasBeenActive; }
  function findVoice() {
    var vs = (synth.getVoices && synth.getVoices()) || [], norm = function (v) { return (v.lang || '').toLowerCase().replace('_', '-'); }, i;
    for (i = 0; i < vs.length; i++) if (/^(rw|kin)\b/.test(norm(vs[i]))) return { v: vs[i], exact: true };
    for (i = 0; i < vs.length; i++) if (/^sw\b/.test(norm(vs[i]))) return { v: vs[i], exact: false };
    return { v: null, exact: false };
  }
  function syncMouth() { box.classList.toggle('talking', typingOn || speaking); }
  function paintVoice() {
    if (!vbtn) return;
    vbtn.hidden = !canTalk; vbtn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false');
    vbtn.setAttribute('aria-label', voiceOn ? 'Ijwi rya Kaze: rirakoze. Kanda urizimye.' : 'Ijwi rya Kaze: rirazimye. Kanda urikore.');
    vbtn.classList.toggle('off', !voiceOn);
  }
  function speak(text) {
    if (!canTalk || !voiceOn || !text) return;
    synth.cancel();
    var spoken = text.replace(/Mw(aramutse|iriwe),\s*[^!]+!/, 'Mw$1!');   /* izina ryawe ntirisomwa mu ijwi */
    var u = new SpeechSynthesisUtterance(spoken), f = findVoice();
    if (f.v) { u.voice = f.v; u.lang = f.v.lang; } else { u.lang = 'rw-RW'; }
    u.rate = 0.95; u.pitch = 1.05;
    u.onstart = function () { speaking = true; syncMouth(); };
    u.onend = u.onerror = function () { speaking = false; syncMouth(); };
    synth.speak(u);
    if (!f.exact && !store.sget('kaze-vnote')) {
      store.sset('kaze-vnote', '1');
      knote.textContent = f.v ? 'Ijwi rya Kinyarwanda ntiribonetse kuri iki gikoresho, nakoresheje irya Kiswahili.' : 'Iki gikoresho gishobora kuba kidafite ijwi rya Kinyarwanda. Niba utumva neza, shyiramo ijwi muri Settings (Text-to-speech).';
      knote.hidden = false;
    }
  }
  function stopSpeaking() { if (canTalk) { synth.cancel(); } speaking = false; syncMouth(); }
  if (canTalk && synth.addEventListener) synth.addEventListener('voiceschanged', function () {});
  window.addEventListener('pagehide', stopSpeaking);
  paintVoice();

  var HIDE = { chat: 1, admin: 1 };          /* paji aho atakwiye kugaragara */
  var restore = document.getElementById('kaze-on');
  function off() { return store.get('kaze') === 'off'; }
  if (HIDE[page]) return;
  if (off()) { if (restore) { restore.hidden = false; restore.onclick = function () { store.set('kaze', 'on'); location.reload(); }; } return; }

  function hello() {
    var h = new Date().getHours(), g = h < 12 ? 'Mwaramutse' : 'Mwiriwe';
    return g + (name ? ', ' + name : '') + '!';
  }
  function link(label, href) { return { label: label, href: href }; }
  function act(label, fn) { return { label: label, fn: fn }; }
  function scrollTo(sel) { var el = $(sel); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }

  /* Ibyo avuga kuri buri paji. */
  function script() {
    var near = link('Amazu ari hafi yanjye', '/map?near=1');
    switch (page) {
      case 'index':
        var cities = [].slice.call(document.querySelectorAll('.chip:not(.zero)')).slice(0, 4).map(function (a) {
          return link(a.querySelector('span') ? a.querySelector('span').textContent : a.textContent, a.getAttribute('href'));
        });
        return { say: [hello() + ' Ndi Kaze. Nzakwereka inzu ikubereye, nta kuzenguruka. Ushaka inzu mu mugi uwuhe?'], replies: cities.concat([near]),
          tips: ['Ushobora no gushyiraho igiciro ntarengwa n\'ibyumba, nkakubonera ibikubereye gusa.', 'Kanda "hafi yanjye" nkwereke amazu agukikije ku ikarita.'] };
      case 'city':
        var n = document.querySelectorAll('.lcard').length, c = ($('h1') || {}).textContent || 'uyu mugi';
        return { say: [n ? 'Hano hari amazu ' + n + ' ' + c.replace(/^Amazu yo gukodesha\s*/i, '') + '. Kanda ku nzu urebe amafoto n\'ibisobanuro byose.' : 'Nta nzu ihari muri iki gihe hano. Gerageza undi mugi cyangwa urebe ku ikarita.'],
          replies: [near, link('Imigi yose', '/')], tips: ['Shakisha ku gace (nka Nyamirambo) kugira ngo ugabanye urutonde.', role ? '' : 'Injira kugira ngo ubone nimero ya telefoni ya nyirinzu.'] };
      case 'listing':
        return { say: ['Ushimye iyi nzu? Mwandikire kuri chat cyangwa umuhamagare. Reba n\'ikarita urebe aho iri neza.'],
          replies: [act('Reba aho iri', function () { scrollTo('#dmap'); }), act('Vugana na nyirinzu', function () { var b = $('form[action*="/chat"] button'); if (b) b.scrollIntoView({ block: 'center' }); })],
          tips: ['Baza igiciro, ibyo kwishyura n\'igihe wayimukiramo mbere yo kujya kuyireba.'] };
      case 'map_page':
        return { say: ['Kanda "Shaka hafi yanjye" nkwereke inzu ikwegereye cyane. Amazu ari ku ikarita nawe ushobora kuyakandaho.'],
          replies: [act('Shaka hafi yanjye', function () { var b = $('#locate'); if (b) b.click(); })],
          tips: ['Wemerera browser kumenya aho uri, bitabaye ibyo sinshobora kubara intera.'] };
      case 'login':
        return { say: ['Murakaza neza! Injira ubone nimero za banyirinzu kandi uvugane nabo kuri chat.'], replies: [link('Nta konti mfite', '/register')], tips: [] };
      case 'register':
        return { say: ['Hitamo "Ushaka inzu" niba ushaka gukodesha, cyangwa "Mfite inzu" niba uyikodesha. Bifata umunota umwe gusa.'], replies: [link('Mfite konti', '/login')], tips: [] };
      case 'account':
        return { say: ['Hano ushyiraho ifoto ya profile yawe. Ifoto ituma abantu bakwizera kandi bakakumenya.'], replies: [act('Shyiraho ifoto', function () { scrollTo('input[type=file]'); })], tips: [] };
      case 'owner_dashboard':
        return { say: [hello() + ' Amafoto meza akurura abantu benshi. Ongeraho inzu nshya cyangwa uvugurure iyo ufite.'], replies: [link('Ongeraho inzu', '/owner/new')],
          tips: ['Iyo inzu ikodeshejwe, yandike nka "Yarakodeshejwe" kugira ngo abantu batayibaza.'] };
      case 'listing_new': case 'listing_edit':
        return { say: ['Ntiwibagirwe gushyira aho inzu iri ku ikarita no gushyiraho amafoto menshi. Ibyo bituma abantu bayibona hafi yabo.'], replies: [act('Jya ku ikarita', function () { scrollTo('#pick'); })], tips: [] };
      case 'chats':
        return { say: ['Hano uvugana n\'abashaka inzu cyangwa banyirinzu. Subiza vuba: abantu bakunda uwitaba vuba.'], replies: [], tips: [] };
      default:
        return { say: ['Muraho! Ndi Kaze, nkeneye kugufasha?'], replies: [link('Ahabanza', '/'), link('Ikarita', '/map')], tips: [] };
    }
  }

  var S = script(); S.tips = (S.tips || []).filter(Boolean);
  var tipI = 0, typing = 0, closeT = 0;

  function setReplies(list) {
    rep.textContent = '';
    list = (list || []).slice();
    if (canTalk && voiceOn && !activated() && lastText) { var t = lastText; list.unshift({ label: 'Umbwire mu ijwi', fn: function () { speak(t); }, keep: true }); }
    list.forEach(function (r) {
      var el;
      if (r.href) { el = document.createElement('a'); el.href = r.href; } else { el = document.createElement('button'); el.type = 'button'; el.addEventListener('click', function () { r.fn(); if (!r.keep) closeBub(); }); }
      el.className = 'kreply'; el.textContent = r.label; rep.appendChild(el);
    });
  }
  function talk(on) { typingOn = !!on; syncMouth(); }
  function say(message, replies) {
    clearInterval(typing); clearTimeout(closeT); lastText = message; knote.hidden = true;
    if (voiceOn && activated()) speak(message); else stopSpeaking();
    bub.hidden = false; box.classList.add('open'); dot.hidden = true; rep.textContent = '';
    box.classList.add('wave'); setTimeout(function () { box.classList.remove('wave'); }, 2600);
    if (reduce) { txt.textContent = message; setReplies(replies); autoClose(message); return; }
    txt.textContent = ''; var i = 0; talk(true);
    typing = setInterval(function () {
      i += 1; txt.textContent = message.slice(0, i);
      if (i >= message.length) { clearInterval(typing); talk(false); setReplies(replies); autoClose(message); }
    }, 22);
  }
  function autoClose(m) { closeT = setTimeout(function () { if (speaking) { autoClose(m); } else closeBub(); }, Math.max(12000, m.length * 120)); }
  function closeBub() { clearInterval(typing); clearTimeout(closeT); stopSpeaking(); talk(false); bub.hidden = true; box.classList.remove('open'); dot.hidden = false; }

  chr.addEventListener('click', function () {
    if (!bub.hidden) { closeBub(); return; }
    if (S.tips.length) { say(S.tips[tipI++ % S.tips.length], S.replies); } else { say(S.say[0], S.replies); }
  });
  document.getElementById('kclose').addEventListener('click', closeBub);
  if (vbtn) vbtn.addEventListener('click', function () {
    voiceOn = !voiceOn; store.set('kaze-voice', voiceOn ? 'on' : 'off'); paintVoice();
    if (voiceOn) { speak(lastText || S.say[0]); } else { stopSpeaking(); }
    setReplies(S.replies);
  });
  document.getElementById('koff').addEventListener('click', function () {
    store.set('kaze', 'off'); box.hidden = true;
    if (restore) { restore.hidden = false; restore.onclick = function () { store.set('kaze', 'on'); location.reload(); }; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !bub.hidden) closeBub(); });

  /* Amaso akurikira urutoki / imbeba. */
  var pl = box.querySelector('.pl'), pr = box.querySelector('.pr');
  if (!reduce && pl && pr) {
    var ticking = false;
    document.addEventListener('pointermove', function (e) {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var r = chr.getBoundingClientRect(), cx = r.left + r.width * 0.48, cy = r.top + r.height * 0.42;
        var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220) * 2.6;
        var t = 'translate(' + (dx / d * k).toFixed(2) + 'px,' + (dy / d * k).toFixed(2) + 'px)';
        pl.style.transform = t; pr.style.transform = t;
      });
    }, { passive: true });
  }

  /* Kugaragara: ageze nyuma y'akanya gato, avuga rimwe kuri buri paji muri session. */
  box.hidden = false;
  setTimeout(function () { box.classList.add('in'); }, 500);
  var seen = 'kaze-' + page;
  setTimeout(function () {
    if (store.sget(seen)) { dot.hidden = false; box.classList.add('wave'); setTimeout(function () { box.classList.remove('wave'); }, 2000); return; }
    store.sset(seen, '1'); say(S.say[0], S.replies);
  }, 1500);

  /* Ku ipaji nkuru: iyo umuntu atakoze ikintu mu masegonda 25, aramwibutsa rimwe. */
  if (page === 'index' && !store.sget('kaze-nudge')) {
    var nt = setTimeout(function () {
      if (!bub.hidden || document.hidden) return;
      store.sset('kaze-nudge', '1'); say('Uracyashakisha? Hitamo umugi, bifata amasegonda abiri gusa.', S.replies);
    }, 25000);
    ['pointerdown', 'keydown'].forEach(function (n) { document.addEventListener(n, function () { clearTimeout(nt); }, { once: true, passive: true }); });
  }
})();
