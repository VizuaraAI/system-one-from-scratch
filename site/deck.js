// Keys: right / PageDown / Space next (reveals first, then the slide); left back; F full screen; N notes; O overview;
// V plays the slide's hidden video (left and right skip hidden videos); on a film slide Space plays and pauses, R restarts. ?all=1 shows every reveal, #n opens slide n.
(function () {
  var deck = document.getElementById('deck'), slides = [].slice.call(deck.querySelectorAll('.slide'));
  var q = new URLSearchParams(location.search), cur = 0, step = 0;
  if (q.get('all')) document.body.classList.add('all');
  function fit() { var s = Math.min(innerWidth / 1920, innerHeight / 1080);
    deck.style.transform = 'translate(' + (innerWidth - 1920 * s) / 2 + 'px,' + (innerHeight - 1080 * s) / 2 + 'px) scale(' + s + ')'; }
  addEventListener('resize', fit); fit();
  // reveals: DOM order, or grouped by data-step
  function groups(sl) { var map = [], seen = {};
    [].forEach.call(sl.querySelectorAll('.frag'), function (f) { var k = f.getAttribute('data-step');
      if (k === null) map.push([f]); else if (seen[k]) seen[k].push(f); else { seen[k] = [f]; map.push(seen[k]); } });
    return map; }
  function vid(sl) { return sl ? sl.querySelector('video') : null; }
  function from0(sl) { return parseFloat(sl.getAttribute('data-start')) || 0; }
  function walk(i, d) { i += d; while (slides[i] && slides[i].hasAttribute('data-hide')) i += d; return slides[i] ? i : cur; }
  function playHidden() { var h = slides[cur + 1]; if (h && h.hasAttribute('data-hide')) show(cur + 1); }
  function show(n, s) { var old = slides[cur], v = vid(old); if (v && n !== cur) { v.pause(); }
    cur = Math.max(0, Math.min(slides.length - 1, n)); slides.forEach(function (x, i) { x.classList.toggle('on', i === cur); });
    var g = groups(slides[cur]); step = s === 'end' ? g.length : (s || 0);
    g.forEach(function (arr, i) { arr.forEach(function (f) { f.classList.toggle('show', i < step); }); });
    try { history.replaceState(null, '', location.search + '#' + (cur + 1)); } catch (err) {}
    document.getElementById('notes').innerHTML = '<b>' + (cur + 1) + ' / ' + slides.length + '</b>' + (slides[cur].getAttribute('data-notes') || '');
    var nv = vid(slides[cur]); if (nv && s !== 'end') { nv.currentTime = from0(slides[cur]); nv.volume = 1; var p = nv.play(); if (p && p.catch) p.catch(function () {}); } }
  function next() { var g = groups(slides[cur]); if (step < g.length) { g[step].forEach(function (f) { f.classList.add('show'); }); step++; } else show(walk(cur, 1)); }
  function prev() { if (step > 0) { step--; groups(slides[cur])[step].forEach(function (f) { f.classList.remove('show'); }); } else show(walk(cur, -1), 'end'); }
  addEventListener('keydown', function (e) { var k = e.key, v = vid(slides[cur]);
    if (e.target.closest && e.target.closest('textarea,input')) { if (k === 'Escape') e.target.blur(); return; }
    if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); next(); }
    else if (k === ' ') { e.preventDefault(); if (v) { if (v.paused) v.play(); else v.pause(); } else next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); prev(); }
    else if (k === 'f' || k === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
    else if (k === 'n' || k === 'N') document.body.classList.toggle('notes');
    else if (k === 'o' || k === 'O') { buildOver(); document.body.classList.toggle('over'); }
    else if (k === 'v' || k === 'V') playHidden();
    else if ((k === 'r' || k === 'R') && v) { v.currentTime = from0(slides[cur]); v.play(); }
    else if ((k === 'j' || k === 'J') && v) v.currentTime = Math.max(0, v.currentTime - 10);
    else if ((k === 'l' || k === 'L') && v) v.currentTime += 10; });
  [].forEach.call(document.querySelectorAll('.vidbtn'), function (b) { b.addEventListener('click', playHidden); });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#over,.film,a,button,.live')) return; if (document.body.classList.contains('over')) return; next(); });
  slides.forEach(function (sl) { var v = vid(sl); if (!v) return; var bar = sl.querySelector('.prog');
    var end = parseFloat(sl.getAttribute('data-end'));
    v.addEventListener('timeupdate', function () { if (bar && v.duration) bar.style.width = (100 * v.currentTime / v.duration) + '%';
      if (end && slides[cur] === sl) { var left = end - v.currentTime; if (left <= 0) next(); else if (left < .6) v.volume = left / .6; } });
    sl.addEventListener('click', function () { if (v.paused) v.play(); else v.pause(); }); });
  function buildOver() { var o = document.getElementById('over'); o.innerHTML = '';
    slides.forEach(function (sl, i) { var a = document.createElement('a'); a.href = '#'; a.className = i === cur ? 'cur' : '';
      a.innerHTML = '<b>' + (i + 1) + '</b>' + (sl.getAttribute('data-title') || '');
      a.onclick = function (e) { e.preventDefault(); document.body.classList.remove('over'); show(i, document.body.classList.contains('all') ? 'end' : 0); }; o.appendChild(a); }); }
  // overflow report for the build check
  window.__report = function () { var bad = []; slides.forEach(function (sl, i) { var was = sl.className; sl.classList.add('on');
      var lim = 1080 - 20; [].forEach.call(sl.querySelectorAll('.body, .body *'), function () {});
      var b = sl.querySelector('.body'); if (b) { var r = b.getBoundingClientRect(), sc = deck.getBoundingClientRect().width / 1920, maxb = r.top, maxr = r.left;
        [].forEach.call(b.querySelectorAll('*'), function (e) { var c = e.getBoundingClientRect(); if (c.height) { maxb = Math.max(maxb, c.bottom); maxr = Math.max(maxr, c.right); } });
        var dr = deck.getBoundingClientRect(), bottom = (maxb - dr.top) / sc, right = (maxr - dr.left) / sc; if (bottom > 1040 || right > 1860) bad.push((i + 1) + ' ' + sl.getAttribute('data-title') + ' bottom=' + Math.round(bottom) + ' right=' + Math.round(right)); }
      sl.className = was; }); return bad; };
  var h = parseInt(location.hash.slice(1), 10); show(h ? h - 1 : 0, q.get('all') ? 'end' : 0);
})();
