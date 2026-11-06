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

  var s = $('#scale');
  function inf() { var v = +s.value, M = [[.3, .25], [.1, .3]], P = function (r, i) { var e = r.map(function (x) { return Math.exp(v * x); }); return e[i] / (e[0] + e[1]); };
    var a = P(M[0], 0), L = [a, P(M[1], 1), P([M[0][0], M[1][0]], 0), P([M[0][1], M[1][1]], 1)].map(function (x) { return -Math.log(x); }).reduce(function (x, y) { return x + y; }) / 4;
    $('#sv').textContent = v; $('#i1').innerHTML = 'Scale: ' + (.3 * v).toFixed(1) + ', ' + (.25 * v).toFixed(1) + '<br>Softmax: ' + pct(a) + ', ' + pct(1 - a) + '<br>Penalty: &minus;ln(' + a.toFixed(3) + ') = ' + (-Math.log(a)).toFixed(3); $('#il').textContent = L.toFixed(3); }
  if (s) { s.oninput = inf; inf(); }
  [].forEach.call(document.querySelectorAll('[id^=g-]'), function (e) { e.addEventListener('keydown', stop); });
  fetch('scores.json').then(function (r) { return r.json(); }).then(quiz);
  fetch('scores2.json').then(function (r) { return r.json(); }).then(function (d) { race(d); tools(d); });
})();
