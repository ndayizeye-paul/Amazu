/* Paji y'inzu: ikarita ntoya y'aho inzu iri. */
(function () {
  'use strict';
  var root = document.getElementById('dmap');
  if (!root) return;
  var lat = parseFloat(root.dataset.lat), lng = parseFloat(root.dataset.lng);
  if (!isFinite(lat) || !isFinite(lng)) return;
  var map = new AmazuMap(root, { center: [lat, lng], zoom: 16, wheel: false });
  var s = document.createElement('span');
  s.className = 'am-house';
  s.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V20H4z"/></svg>';
  map.addMarker({ lat: lat, lng: lng, el: s });
})();
