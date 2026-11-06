// Replays real saved probabilities from our trained heads. Win rates are measured in pipeline/game_scores*.py.
(function () {
  var $ = function (s) { return document.querySelector(s); }, pct = function (x) { return (100 * x).toFixed(1) + '%'; };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function bar(label, p, cls) { return '<div class="pick ' + (cls || '') + '"><div class="f" style="width:' + 100 * p + '%"></div><div class="x"><span>' + esc(label) + '</span><span>' + pct(p) + '</span></div></div>'; }
  function note(el, t) { el.insertAdjacentHTML('beforeend', '<p class="note" style="margin-top:18px">' + t + '</p>'); }
  function stop(e) { e.stopPropagation(); }

  // Plays by itself whenever its slide is on screen.
  function loop(el, frames, each) {
    var sl = el.closest('.slide'), i = 0, t = null, was = false;
    function clear() { clearTimeout(t); }
    function next() { each(frames[i % frames.length], function (ms) { i++; t = setTimeout(next, ms); }, function (fn, ms) { t = setTimeout(fn, ms); }); }
    new MutationObserver(function () { var on = sl.classList.contains('on'); if (on && !was) { i = 0; clear(); next(); } if (!on) clear(); was = on; }).observe(sl, { attributes: true, attributeFilter: ['class'] });
    if (sl.classList.contains('on')) { was = true; next(); }
  }
  function decide(el, footer, f, done, later) {
    var order = f.options.slice().sort(function (a, b) { return b.p - a.p; });
    el.innerHTML = '<p style="font-size:54px;font-weight:300;line-height:1.2;letter-spacing:-.02em;min-height:140px;margin-top:12px">' + esc(f.q) + '</p>' + f.options.map(function (o) { return '<div class="pick" style="font-size:38px;padding:17px 22px;transition:border-color .3s" data-l="' + esc(o.l) + '"><div class="f" style="width:0;transition:width .9s ease"></div><div class="x"><span>' + esc(o.l) + '</span><span class="v"></span></div></div>'; }).join('') + '<p class="note" style="margin-top:18px">' + footer + '</p>';
    later(function () {
      [].forEach.call(el.querySelectorAll('.pick'), function (n, i) { n.querySelector('.f').style.width = 100 * f.options[i].p + '%'; n.querySelector('.v').textContent = pct(f.options[i].p); });
      later(function () { var n = [].filter.call(el.querySelectorAll('.pick'), function (x) { return x.getAttribute('data-l') === order[0].l; })[0]; n.classList.add('gold'); n.querySelector('.x span').style.fontWeight = 500; done(2200); }, 1200);
    }, 900);
  }
  function quiz(d) {
    var R = d.heads.ours_neg3e4, el = $('#g-quiz'), F = [];
    d.trivia.forEach(function (t, i) { var p = R.trivia[i]; if (p.indexOf(Math.max.apply(null, p)) === t[2]) F.push({ q: t[0], options: t[1].map(function (o, j) { return { l: o, p: p[j] }; }) }); });
    loop(el, F, function (f, done, later) { decide(el, 'Real outputs of our model, sped up for the room. Measured: 8 of 10 correct on this set. Correct ones shown.', f, done, later); });
  }
  function best(d, key) { var b = 'ours_final', top = -1; ['ours_final', 'ours_mid', 'ours_pre'].forEach(function (k) { var s = key(d.heads[k]); if (s > top + 1e-9) { top = s; b = k; } }); return b; }
  function tools(d) {
    var R = d.heads.ours_final, el = $('#g-tools'), F = [];
    d.asks.forEach(function (a, i) { var p = R.tools[i], top = Object.keys(p).sort(function (x, y) { return p[y] - p[x]; }); if (top[0] === a[1]) F.push({ q: '“' + a[0] + '”', options: top.slice(0, 4).map(function (t) { return { l: t, p: p[t] }; }) }); });
    loop(el, F, function (f, done, later) { decide(el, 'Real outputs of our final model. Top 4 of 8 tools shown. Measured: ' + Math.round(R.tools_acc * d.asks.length) + ' of ' + d.asks.length + ' correct. Correct ones shown.', f, done, later); });
  }
  function race(d) {
    var k = best(d, function (h) { return h.race_won / h.race_total; }), R = d.heads[k], el = $('#g-race'), F = R.race_runs.filter(function (r) { return r.won; });
    loop(el, F, function (w, done, later) {
      function draw(n) {
        var path = w.path.slice(0, n), cur = path[path.length - 1], o = R.race[cur + '|' + w.goal];
        el.innerHTML = '<div class="mono" style="font-size:28px;color:#8c8c8c;margin-top:10px">Goal: reach <span style="color:#4d6bfe">' + esc(w.goal) + '</span></div><p style="font-size:58px;font-weight:300;line-height:1.25;letter-spacing:-.02em;min-height:160px;margin-top:14px">' + path.map(esc).join(' <span style="color:#4d6bfe">&rarr;</span> ') + '</p>' +
          (cur === w.goal ? '<p style="font-size:54px;font-weight:300;color:#4d6bfe;margin-top:20px">Reached it in ' + (path.length - 1) + ' clicks</p>' : (o ? Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, 4).map(function (l) { return bar(l, o[l], l === w.path[n] ? 'gold' : ''); }).join('') : '')) + '<p class="note" style="margin-top:18px">Real outputs of ' + (k === 'ours_pre' ? 'our pre-trained head' : 'our head') + ' on our own small topic graph. Measured: ' + R.race_won + ' of ' + R.race_total + ' races won. Wins shown. The blue outline is the link it takes; it never revisits a page.</p>';
        if (n < w.path.length) later(function () { draw(n + 1); }, 1600); else done(2600);
      }
      draw(1);
    });
  }

  function train(T, M, P) {
    var chart = $('#' + P + '-chart'); if (!chart) return;
    var ST = [['pre', 'Pre-training', 0.62, T.pre], ['mid', 'Mid-training', 0.25, T.mid], ['post', 'Post-training', 0.13, T.post]];
    var W = 1000, H = 470, L = 70, B = 40, Tp = 14, y = function (v) { return Tp + (H - Tp - B) * (1 - v / 0.8); }, seq = [], base = 0, pos = 0, total = 0;
    ST.forEach(function (g, gi) { var pts = g[3], last = pts[pts.length - 1].s, off = pos; pts.forEach(function (d) { seq.push({ stage: gi, step: base + d.s, x: L + (W - L - 20) * (off + g[2] * d.s / last), h: d.h, l: d.l }); }); pos += g[2]; base += last; }); total = base;
    var grid = ''; [0, .2, .4, .6, .8].forEach(function (v) { grid += '<line x1="' + L + '" x2="' + (W - 20) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#ececec"/><text x="' + (L - 10) + '" y="' + (y(v) + 7) + '" text-anchor="end" font-size="20" fill="#8c8c8c">' + v * 100 + '%</text>'; });
    var off2 = 0; ST.forEach(function (g) { var x = L + (W - L - 20) * off2; grid += '<line x1="' + x + '" x2="' + x + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#dcdcdc" stroke-dasharray="5 6"/>'; off2 += g[2]; });
    chart.innerHTML = grid + '<polyline id="' + P + '-line" fill="none" stroke="#4d6bfe" stroke-width="5" points=""/><circle id="' + P + '-dot" r="9" fill="#4d6bfe" cx="' + L + '" cy="' + y(.08) + '"/>';
    function mat(name) {
      if (!M) return; var st = M.stages[name], n = M.labels.length, h = '<div style="display:grid;grid-template-columns:repeat(' + n + ',1fr);gap:3px">';
      st.m.forEach(function (r, i) { r.forEach(function (v, j) { var c = i === j ? '77,107,254' : '180,35,24'; h += '<div title="' + esc(M.labels[i][0]) + ' / ' + esc(M.labels[j][1]) + ': ' + pct(v) + '" style="aspect-ratio:1;background:rgba(' + c + ',' + Math.max(.03, v) + ');transition:background .7s;' + (i === j ? 'outline:1px solid #4d6bfe;outline-offset:-1px' : '') + '"></div>'; }); });
      $('#' + P + '-mat').innerHTML = h + '</div>';
      $('#' + P + '-hits').textContent = st.hits + ' of 8 questions matched to the right answer';
    }
    function stages(i, done) { $('#' + P + '-stages').innerHTML = ST.map(function (g, k) { return '<div class="mono" style="flex:1;font-size:21px;padding:9px 12px;text-align:center;background:' + (done || k < i ? '#eef1ff' : k === i ? '#4d6bfe' : '#f4f4f4') + ';color:' + (!done && k === i ? '#fff' : k < i || done ? '#4d6bfe' : '#8c8c8c') + '">' + g[1] + '</div>'; }).join(''); }
    var timer = null, lastH = .0805;
    function reset() { clearInterval(timer); $('#' + P + '-line').setAttribute('points', ''); lastH = .0805; stages(0); mat('start'); }
    function play() {
      reset(); var i = 0, pts = '', cur = -1, names = ['pre', 'mid', 'post'], steps = seq.length;
      timer = setInterval(function () {
        if (i >= steps) { clearInterval(timer); stages(2, true); mat('post'); return; }
        var p = seq[i]; if (p.stage !== cur) { if (cur >= 0) mat(names[cur]); cur = p.stage; stages(cur); }
        if (p.h !== null) { lastH = p.h; pts += p.x.toFixed(1) + ',' + y(p.h).toFixed(1) + ' '; $('#' + P + '-line').setAttribute('points', pts); $('#' + P + '-dot').setAttribute('cx', p.x); $('#' + P + '-dot').setAttribute('cy', y(p.h)); }
        $('#' + P + '-step').textContent = p.step.toLocaleString('en-US'); $('#' + P + '-seen').textContent = (p.step * 16384 / 1e6).toFixed(0) + 'M'; $('#' + P + '-loss').textContent = p.l.toFixed(2); $('#' + P + '-acc').textContent = (100 * lastH).toFixed(1) + '%';
        i++;
      }, 260);
    }
    $('#' + P + '-go').onclick = play; reset();
    var sl = chart.closest('.slide'), was = false; new MutationObserver(function () { var on = sl.classList.contains('on'); if (on && !was) play(); if (!on) clearInterval(timer); was = on; }).observe(sl, { attributes: true, attributeFilter: ['class'] });
    if (sl.classList.contains('on')) { was = true; play(); }
  }
  Promise.all([fetch('train.json').then(function (r) { return r.json(); }), fetch('matrix.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })]).then(function (a) { train(a[0], a[1], 't2'); train(a[0], a[1], 'tr'); });
  var s = $('#scale');
  function inf() { var v = +s.value, M = [[.3, .25], [.1, .3]], P = function (r, i) { var e = r.map(function (x) { return Math.exp(v * x); }); return e[i] / (e[0] + e[1]); };
    var a = P(M[0], 0), L = [a, P(M[1], 1), P([M[0][0], M[1][0]], 0), P([M[0][1], M[1][1]], 1)].map(function (x) { return -Math.log(x); }).reduce(function (x, y) { return x + y; }) / 4;
    $('#sv').textContent = v; $('#i1').innerHTML = 'Scale: ' + (.3 * v).toFixed(1) + ', ' + (.25 * v).toFixed(1) + '<br>Softmax: ' + pct(a) + ', ' + pct(1 - a) + '<br>Penalty: &minus;ln(' + a.toFixed(3) + ') = ' + (-Math.log(a)).toFixed(3); $('#il').textContent = L.toFixed(3); }
  if (s) { s.oninput = inf; inf(); }
  [].forEach.call(document.querySelectorAll('[id^=g-]'), function (e) { e.addEventListener('keydown', stop); });
  fetch('scores.json').then(function (r) { return r.json(); }).then(quiz);
  fetch('scores2.json').then(function (r) { return r.json(); }).then(function (d) { race(d); tools(d); });
})();
