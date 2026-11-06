// Replays real saved probabilities from our trained heads. Win rates are measured in pipeline/game_scores*.py.
(function () {
  var $ = function (s) { return document.querySelector(s); }, pct = function (x) { return (100 * x).toFixed(1) + '%'; };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function bar(label, p, cls) { return '<div class="pick ' + (cls || '') + '"><div class="f" style="width:' + 100 * p + '%"></div><div class="x"><span>' + esc(label) + '</span><span>' + pct(p) + '</span></div></div>'; }
  function note(el, t) { el.insertAdjacentHTML('beforeend', '<p class="note" style="margin-top:18px">' + t + '</p>'); }
  function stop(e) { e.stopPropagation(); }

  function quiz(d) {
    var R = d.heads.ours_neg3e4, q = 0, you = 0, me = 0, el = $('#g-quiz');
    function draw() {
      var it = d.trivia[q];
      el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline"><p class="lead" style="margin:0;color:#000;font-size:44px">' + esc(it[0]) + '</p><div class="mono" style="font-size:28px;white-space:nowrap;margin-left:30px">You ' + you + ' &middot; Model ' + me + '</div></div><div id="qo" style="margin-top:20px">' + it[1].map(function (o, i) { return '<button class="pick" data-i="' + i + '">' + esc(o) + '</button>'; }).join('') + '</div><div id="qn"></div>';
      note(el, 'Question ' + (q + 1) + ' of ' + d.trivia.length + '. Measured: our model gets ' + Math.round(R.trivia_acc * d.trivia.length) + ' of ' + d.trivia.length + ' correct.');
      [].forEach.call(el.querySelectorAll('button.pick'), function (b) { b.onclick = function () {
        var c = +b.getAttribute('data-i'), p = R.trivia[q], g = it[2], m = p.indexOf(Math.max.apply(null, p)); you += c === g; me += m === g;
        $('#qo').innerHTML = it[1].map(function (o, i) { return bar(o, p[i], (i === g ? 'gold ' : '') + (i === c ? 'you' : '')); }).join('');
        $('#qn').innerHTML = '<button id="qnx">' + (q < d.trivia.length - 1 ? 'Next question' : 'Play again') + '</button>';
        $('#qnx').onclick = function () { if (q < d.trivia.length - 1) q++; else { q = 0; you = 0; me = 0; } draw(); };
      }; });
    }
    draw();
  }

  function pickHead(d2, keyfn) { var best = 'ours_final', top = -1; ['ours_final', 'ours_mid', 'ours_pre'].forEach(function (k) { var s = keyfn(d2.heads[k]); if (s > top + 1e-9) { top = s; best = k; } }); return best; }
  var LABEL = { ours_final: 'our final head', ours_mid: 'our mid-trained head', ours_pre: 'our pre-trained head' };

  function race(d) {
    var k = pickHead(d, function (h) { return h.race_won / h.race_total; }), R = d.heads[k], i = 0, el = $('#g-race'), timer = null;
    R.race_runs.sort(function (x, y) { return y.won - x.won; });
    function draw(run, upto) {
      var w = R.race_runs[i], path = w.path.slice(0, upto), cur = path[path.length - 1], opts = R.race[cur + '|' + w.goal];
      el.innerHTML = '<div class="btns" style="margin-bottom:18px">' + R.race_runs.map(function (r, j) { return '<button class="' + (j === i ? 'on' : '') + '" data-j="' + j + '" style="font-size:18px;padding:9px 12px">' + esc(r.start) + ' &rarr; ' + esc(r.goal) + '</button>'; }).join('') + '</div>' +
        '<div style="font-size:40px;font-weight:300;line-height:1.3;min-height:104px">' + path.map(esc).join(' <span style="color:#4d6bfe">&rarr;</span> ') + '</div><div style="margin-top:6px">' +
        (cur === w.goal ? '<p class="lead" style="color:#4d6bfe">Reached ' + esc(w.goal) + ' in ' + (path.length - 1) + ' clicks.</p>' : (opts ? Object.keys(opts).sort(function (a, b) { return opts[b] - opts[a]; }).map(function (o) { return bar(o, opts[o]); }).join('') : '')) +
        (cur !== w.goal && upto >= w.path.length ? '<p class="lead">Out of clicks before reaching ' + esc(w.goal) + '.</p>' : '') + '</div><p style="margin-top:12px"><button id="rp">Play this race</button></p>';
      note(el, 'Measured: ' + LABEL[k] + ' wins ' + R.race_won + ' of ' + R.race_total + ' races, within 8 clicks, on our own small graph of ' + Object.keys(d.graph).length + ' topics.');
      [].forEach.call(el.querySelectorAll('[data-j]'), function (b) { b.onclick = function () { clearInterval(timer); i = +b.getAttribute('data-j'); draw(null, 1); }; });
      $('#rp').onclick = function () { clearInterval(timer); var u = 1; draw(null, u); timer = setInterval(function () { u++; if (u > R.race_runs[i].path.length) { clearInterval(timer); return; } draw(null, u); }, 1100); };
    }
    draw(null, 1);
  }

  function tools(d) {
    var k = pickHead(d, function (h) { return h.tools_acc; }), R = d.heads[k], i = 0, el = $('#g-tools');
    function draw() {
      var p = R.tools[i], gold = d.asks[i][1];
      el.innerHTML = '<p class="lead" style="margin:0 0 18px;color:#000;font-size:44px">&ldquo;' + esc(d.asks[i][0]) + '&rdquo;</p>' + Object.keys(p).sort(function (a, b) { return p[b] - p[a]; }).slice(0, 5).map(function (t) { return bar(t, p[t], t === gold ? 'gold' : ''); }).join('') + '<p style="margin-top:14px"><button id="tn">Next request</button></p>';
      note(el, 'Blue outline: the right tool. Top 5 of 8 tools shown. Measured: ' + LABEL[k] + ' picks the right tool ' + Math.round(R.tools_acc * d.asks.length) + ' of ' + d.asks.length + ' times.');
      $('#tn').onclick = function () { i = (i + 1) % d.asks.length; draw(); };
    }
    draw();
  }

  function train(T, M) {
    var chart = $('#tr-chart'); if (!chart) return;
    var ST = [['pre', 'Pre-training', 0.62, T.pre], ['mid', 'Mid-training', 0.25, T.mid], ['post', 'Post-training', 0.13, T.post]];
    var W = 1000, H = 470, L = 70, B = 40, Tp = 14, y = function (v) { return Tp + (H - Tp - B) * (1 - v / 0.8); }, seq = [], base = 0, pos = 0, total = 0;
    ST.forEach(function (g, gi) { var pts = g[3], last = pts[pts.length - 1].s, off = pos; pts.forEach(function (d) { seq.push({ stage: gi, step: base + d.s, x: L + (W - L - 20) * (off + g[2] * d.s / last), h: d.h, l: d.l }); }); pos += g[2]; base += last; }); total = base;
    var grid = ''; [0, .2, .4, .6, .8].forEach(function (v) { grid += '<line x1="' + L + '" x2="' + (W - 20) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#ececec"/><text x="' + (L - 10) + '" y="' + (y(v) + 7) + '" text-anchor="end" font-size="20" fill="#8c8c8c">' + v * 100 + '%</text>'; });
    var off2 = 0; ST.forEach(function (g) { var x = L + (W - L - 20) * off2; grid += '<line x1="' + x + '" x2="' + x + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#dcdcdc" stroke-dasharray="5 6"/><text x="' + (x + 8) + '" y="' + (H - 12) + '" font-size="20" fill="#8c8c8c">' + g[1] + '</text>'; off2 += g[2]; });
    chart.innerHTML = grid + '<polyline id="tr-line" fill="none" stroke="#4d6bfe" stroke-width="5" points=""/><circle id="tr-dot" r="9" fill="#4d6bfe" cx="' + L + '" cy="' + y(.08) + '"/>';
    function mat(name) {
      if (!M) return; var st = M.stages[name], n = M.labels.length, h = '<div style="display:grid;grid-template-columns:repeat(' + n + ',1fr);gap:3px">';
      st.m.forEach(function (r, i) { r.forEach(function (v, j) { var c = i === j ? '77,107,254' : '180,35,24'; h += '<div title="' + esc(M.labels[i][0]) + ' / ' + esc(M.labels[j][1]) + ': ' + pct(v) + '" style="aspect-ratio:1;background:rgba(' + c + ',' + Math.max(.03, v) + ');transition:background .7s;' + (i === j ? 'outline:1px solid #4d6bfe;outline-offset:-1px' : '') + '"></div>'; }); });
      $('#tr-mat').innerHTML = h + '</div>';
      $('#tr-hits').textContent = st.hits + ' of 8 questions matched to the right answer';
    }
    function stages(i, done) { $('#tr-stages').innerHTML = ST.map(function (g, k) { return '<div class="mono" style="flex:1;font-size:21px;padding:9px 12px;text-align:center;background:' + (done || k < i ? '#eef1ff' : k === i ? '#4d6bfe' : '#f4f4f4') + ';color:' + (!done && k === i ? '#fff' : k < i || done ? '#4d6bfe' : '#8c8c8c') + '">' + g[1] + '</div>'; }).join(''); }
    var timer = null, lastH = .0805;
    function reset() { clearInterval(timer); $('#tr-line').setAttribute('points', ''); lastH = .0805; stages(0); mat('start'); }
    function play() {
      reset(); var i = 0, pts = '', cur = -1, names = ['pre', 'mid', 'post'], steps = seq.length;
      timer = setInterval(function () {
        if (i >= steps) { clearInterval(timer); stages(2, true); mat('post'); return; }
        var p = seq[i]; if (p.stage !== cur) { if (cur >= 0) mat(names[cur]); cur = p.stage; stages(cur); }
        if (p.h !== null) { lastH = p.h; pts += p.x.toFixed(1) + ',' + y(p.h).toFixed(1) + ' '; $('#tr-line').setAttribute('points', pts); $('#tr-dot').setAttribute('cx', p.x); $('#tr-dot').setAttribute('cy', y(p.h)); }
        $('#tr-step').textContent = p.step.toLocaleString('en-US'); $('#tr-seen').textContent = (p.step * 16384 / 1e6).toFixed(0) + 'M'; $('#tr-loss').textContent = p.l.toFixed(2); $('#tr-acc').textContent = (100 * lastH).toFixed(1) + '%';
        i++;
      }, 260);
    }
    $('#tr-go').onclick = play; reset();
    var sl = chart.closest('.slide'), was = false; new MutationObserver(function () { var on = sl.classList.contains('on'); if (on && !was) play(); if (!on) clearInterval(timer); was = on; }).observe(sl, { attributes: true, attributeFilter: ['class'] });
    if (sl.classList.contains('on')) { was = true; play(); }
  }
  Promise.all([fetch('train.json').then(function (r) { return r.json(); }), fetch('matrix.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })]).then(function (a) { train(a[0], a[1]); });
  var s = $('#scale');
  function inf() { var v = +s.value, M = [[.3, .25], [.1, .3]], P = function (r, i) { var e = r.map(function (x) { return Math.exp(v * x); }); return e[i] / (e[0] + e[1]); };
    var a = P(M[0], 0), L = [a, P(M[1], 1), P([M[0][0], M[1][0]], 0), P([M[0][1], M[1][1]], 1)].map(function (x) { return -Math.log(x); }).reduce(function (x, y) { return x + y; }) / 4;
    $('#sv').textContent = v; $('#i1').innerHTML = 'Scale: ' + (.3 * v).toFixed(1) + ', ' + (.25 * v).toFixed(1) + '<br>Softmax: ' + pct(a) + ', ' + pct(1 - a) + '<br>Penalty: &minus;ln(' + a.toFixed(3) + ') = ' + (-Math.log(a)).toFixed(3); $('#il').textContent = L.toFixed(3); }
  if (s) { s.oninput = inf; inf(); }
  [].forEach.call(document.querySelectorAll('[id^=g-]'), function (e) { e.addEventListener('keydown', stop); });
  fetch('scores.json').then(function (r) { return r.json(); }).then(quiz);
  fetch('scores2.json').then(function (r) { return r.json(); }).then(function (d) { race(d); tools(d); });
})();
