(function () {
  'use strict';

  var DATA = window.EXAM_DATA || { title: '', subtitle: '', sections: [] };

  /* ---------- storage (may throw in private mode / blocked cookies) ---------- */
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  // Renders blank-line-separated text as paragraphs.
  function paras(s) {
    return String(s || '').split(/\n\s*\n/).map(function (p) {
      return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  // Strips tashkeel + tatweel so search matches however the user types it.
  function norm(s) {
    return String(s || '')
      .replace(/[ً-ْٰـ]/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  var AR = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function arNum(n) { return String(n).replace(/\d/g, function (d) { return AR[+d]; }); }

  function allExams() {
    var out = [];
    DATA.sections.forEach(function (s) {
      (s.exams || []).forEach(function (e) { out.push({ section: s, exam: e }); });
    });
    return out;
  }
  function findExam(sid, eid) {
    var s = DATA.sections.filter(function (x) { return x.id === sid; })[0];
    if (!s) return null;
    var e = (s.exams || []).filter(function (x) { return x.id === eid; })[0];
    return e ? { section: s, exam: e } : null;
  }
  function pagesLabel(e) {
    if (e.pages) return 'الصَّفَحَات: ' + e.pages;
    return '';
  }

  /* ---------- theme ---------- */
  var root = document.documentElement;
  var saved = get('theme', '');
  if (saved) root.setAttribute('data-theme', saved);
  $('#themeBtn').addEventListener('click', function () {
    var cur = root.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    set('theme', next);
  });

  /* ---------- sidebar (mobile) ---------- */
  var sidebar = $('#sidebar'), scrim = $('#scrim'), navToggle = $('#navToggle');
  function closeNav() { sidebar.classList.remove('open'); scrim.hidden = true; navToggle.setAttribute('aria-expanded', 'false'); }
  navToggle.addEventListener('click', function () {
    var open = sidebar.classList.toggle('open');
    scrim.hidden = !open;
    navToggle.setAttribute('aria-expanded', String(open));
  });
  scrim.addEventListener('click', closeNav);

  /* ---------- nav tree ---------- */
  // Exams are shown as compact numbered chips rather than a long stack of
  // full-width rows, so a section with a dozen exams stays scannable.
  function chip(s, e, label) {
    return '<a class="chip" href="#/s/' + esc(s.id) + '/e/' + esc(e.id) + '"' +
      ' data-key="' + esc(s.id + '/' + e.id) + '"' +
      ' title="' + esc(e.title) + ' — ' + arNum((e.questions || []).length) + ' سؤالًا">' +
      label + '</a>';
  }

  function renderNav() {
    var host = $('#navTree');
    if (!DATA.sections.length) {
      host.innerHTML = '<p class="nav-note">لَا تُوجَدُ أَقْسَامٌ بَعْدُ.</p>';
      return;
    }
    host.innerHTML = DATA.sections.map(function (s) {
      var ranges = (s.exams || []).filter(function (e) { return e.kind !== 'mixed'; });
      var mixed = (s.exams || []).filter(function (e) { return e.kind === 'mixed'; });
      var total = ranges.reduce(function (n, e) { return n + (e.questions || []).length; }, 0);

      // Group the page-range exams by their span so each span is one row.
      var order = [], byspan = {};
      ranges.forEach(function (e) {
        var k = e.pages || '';
        if (!byspan[k]) { byspan[k] = []; order.push(k); }
        byspan[k].push(e);
      });

      var html = '<details class="nav-sec" open><summary>' + esc(s.title) +
        '<span class="count">' + arNum(total) + ' سؤالًا</span></summary>';

      if (order.length) {
        html += '<div class="nav-note">صَفَحَاتٌ</div>';
        html += order.map(function (k) {
          var group = byspan[k];
          var chips = group.map(function (e, i) {
            return chip(s, e, group.length > 1 ? arNum(i + 1) : '•');
          }).join('');
          return '<div class="span-row"><span class="span-label">' + esc(k) + '</span>' +
                 '<div class="chips">' + chips + '</div></div>';
        }).join('');
      }

      if (mixed.length) {
        html += '<div class="nav-note">شَامِلَةٌ — مِنْ كُلِّ الْقِسْمِ</div>';
        html += '<div class="chips wide">' + mixed.map(function (e, i) {
          return chip(s, e, arNum(i + 1));
        }).join('') + '</div>';
      }
      return html + '</details>';
    }).join('');
  }

  function markActive(key) {
    Array.prototype.forEach.call(document.querySelectorAll('.chip, .nav-exam'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-key') === key);
    });
  }

  /* ---------- question rendering ---------- */
  function qHTML(q, i, examId, reveal) {
    var gk = 'g:' + q.id;
    var g = get(gk, '');
    var typeBadge = q.type === 'word'
      ? '<span class="badge t-word">معنى كلمة</span>'
      : '<span class="badge t-matn">قول المؤلّف</span>';
    if (q.src === 'hashiya') {
      typeBadge += '<span class="badge t-src">مِنَ الحَاشِيَةِ</span>';
    }

    var body = '';
    if (q.type === 'word') {
      body = '<p class="q-text">مَا مَعْنَى ' +
        '<span class="word-chip">' + esc(q.word) + '</span>؟</p>';
    } else {
      body = '<p class="q-text">' + esc(q.q || 'قَالَ المُؤَلِّفُ رَحِمَهُ اللَّهُ — اشْرَحْ كَلَامَهُ شَرْحًا تَامًّا') + '</p>' +
        (q.matn ? '<blockquote class="matn">' + esc(q.matn) + '</blockquote>' : '');
    }

    return '<article class="q" id="q-' + esc(q.id) + '" data-qid="' + esc(q.id) + '">' +
      '<div class="q-head">' +
        '<span class="q-num">' + arNum(i + 1) + '</span>' + typeBadge +
        (q.page ? '<span class="badge">ص ' + arNum(q.page) + '</span>' : '') +
      '</div>' +
      body +
      '<button class="btn reveal" type="button" aria-expanded="' + (reveal ? 'true' : 'false') + '">' +
        (reveal ? 'إخفَاءُ الجَوَابِ' : 'إظْهَارُ الجَوَابِ') +
      '</button>' +
      '<div class="ans-wrap"' + (reveal ? '' : ' hidden') + '>' +
        '<div class="answer"><h4>الْجَوَابُ</h4>' + paras(q.a) + '</div>' +
        (q.note ? '<div class="note"><h4>حَاشِيَةُ الصَّفْحَةِ — زِيَادَةُ عِلْمٍ لِلْمُطَالَعَةِ فَقَط، لَيْسَتْ مِنَ الْجَوَابِ</h4>' + paras(q.note) + '</div>' : '') +
        '<div class="grade">' +
          '<button class="btn" type="button" data-g="ok"' + (g === 'ok' ? ' class="on"' : '') + '>أَجَبْتُ صَحِيحًا</button>' +
          '<button class="btn" type="button" data-g="again">أُعِيدُ مُرَاجَعَتَهُ</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderExam(sid, eid) {
    var found = findExam(sid, eid);
    var view = $('#view');
    if (!found) { renderHome(); return; }
    var s = found.section, e = found.exam, qs = e.questions || [];
    markActive(sid + '/' + eid);

    view.innerHTML =
      '<div class="exam-head">' +
        '<h1>' + esc(e.title) + '</h1>' +
        '<div class="exam-meta">' +
          '<span>' + esc(s.title) + '</span>' +
          (e.pages ? '<span>' + esc(pagesLabel(e)) + '</span>' : '') +
          '<span>عَدَدُ الأَسْئِلَةِ: ' + arNum(qs.length) + '</span>' +
        '</div>' +
        '<div class="toolbar">' +
          '<button class="btn primary" id="showAll" type="button">إظْهَارُ كُلِّ الأَجْوِبَةِ</button>' +
          '<button class="btn" id="hideAll" type="button">إخْفَاءُ كُلِّ الأَجْوِبَةِ</button>' +
          '<button class="btn" id="printBtn" type="button">طِبَاعَة</button>' +
          '<button class="btn" id="resetBtn" type="button">تَصْفِيرُ التَّقْيِيمِ</button>' +
        '</div>' +
        '<div class="progress"><i id="bar"></i></div>' +
        '<div class="progress-label" id="barLabel"></div>' +
      '</div>' +
      (qs.length ? qs.map(function (q, i) { return qHTML(q, i, e.id, false); }).join('')
                 : '<div class="callout">لا توجد أسئلة في هذا الامتحان بعد.</div>');

    // restore grade states
    qs.forEach(function (q) {
      var g = get('g:' + q.id, '');
      if (!g) return;
      var card = $('#q-' + CSS.escape(q.id));
      if (!card) return;
      var b = card.querySelector('.grade .btn[data-g="' + g + '"]');
      if (b) b.classList.add('on');
    });
    updateBar(e, qs);

    $('#showAll').addEventListener('click', function () { toggleAll(true); });
    $('#hideAll').addEventListener('click', function () { toggleAll(false); });
    $('#printBtn').addEventListener('click', function () { toggleAll(true); window.print(); });
    $('#resetBtn').addEventListener('click', function () {
      qs.forEach(function (q) { set('g:' + q.id, ''); });
      renderExam(sid, eid);
    });

    view.addEventListener('click', onCardClick);
    view._exam = e; view._qs = qs;
    window.scrollTo(0, 0);
  }

  function toggleAll(show) {
    Array.prototype.forEach.call(document.querySelectorAll('.q'), function (card) {
      var w = card.querySelector('.ans-wrap'), b = card.querySelector('.reveal');
      if (!w || !b) return;
      w.hidden = !show;
      b.setAttribute('aria-expanded', String(show));
      b.textContent = show ? 'إخفَاءُ الجَوَابِ' : 'إظْهَارُ الجَوَابِ';
    });
  }

  function onCardClick(ev) {
    var card = ev.target.closest ? ev.target.closest('.q') : null;
    if (!card) return;
    var view = $('#view');
    if (ev.target.classList.contains('reveal')) {
      var w = card.querySelector('.ans-wrap');
      var show = w.hidden;
      w.hidden = !show;
      ev.target.setAttribute('aria-expanded', String(show));
      ev.target.textContent = show ? 'إخفَاءُ الجَوَابِ' : 'إظْهَارُ الجَوَابِ';
      return;
    }
    var gb = ev.target.closest ? ev.target.closest('.grade .btn') : null;
    if (gb && view._exam) {
      var qid = card.getAttribute('data-qid');
      var key = 'g:' + qid;
      var want = gb.getAttribute('data-g');
      var cur = get(key, '');
      var next = cur === want ? '' : want;
      set(key, next);
      Array.prototype.forEach.call(card.querySelectorAll('.grade .btn'), function (b) {
        b.classList.toggle('on', next && b.getAttribute('data-g') === next);
      });
      updateBar(view._exam, view._qs);
    }
  }

  function updateBar(e, qs) {
    var done = qs.filter(function (q) { return get('g:' + q.id, ''); }).length;
    var ok = qs.filter(function (q) { return get('g:' + q.id, '') === 'ok'; }).length;
    var pct = qs.length ? Math.round((done / qs.length) * 100) : 0;
    var bar = $('#bar'), lab = $('#barLabel');
    if (bar) bar.style.width = pct + '%';
    if (lab) lab.textContent = 'أَجَبْتَ عَنْ ' + arNum(done) + ' مِنْ ' +
      arNum(qs.length) + '، مِنْهَا ' + arNum(ok) + ' صَحِيحَةٌ.';
  }

  /* ---------- home ---------- */
  function renderHome() {
    markActive('');
    var totalQ = allExams().reduce(function (n, x) {
      return x.exam.kind === 'mixed' ? n : n + (x.exam.questions || []).length;
    }, 0);
    var view = $('#view');
    if (!DATA.sections.length) {
      view.innerHTML = '<div class="empty"><h2>لَمْ يُضَفْ مُحْتَوًى بَعْدُ</h2><p>أضِف ملفات الأسئلة في مجلد data/.</p></div>';
      return;
    }
    view.innerHTML =
      '<div class="exam-head">' +
        '<h1>' + esc(DATA.title || 'بَنْكُ الاِمْتِحَانَاتِ') + '</h1>' +
        '<div class="exam-meta"><span>' + esc(DATA.subtitle || '') + '</span>' +
        '<span>مَجْمُوعُ الأَسْئِلَةِ: ' + arNum(totalQ) + '</span></div>' +
      '</div>' +
      DATA.sections.map(function (s) {
        var n = (s.exams || []).reduce(function (a, e) {
          return e.kind === 'mixed' ? a : a + (e.questions || []).length;
        }, 0);
        return '<article class="q"><div class="q-head"><span class="q-num">ق</span>' +
          '<strong>' + esc(s.title) + '</strong>' +
          (s.pages ? '<span class="badge">' + esc(s.pages) + '</span>' : '') +
          '<span class="badge">' + arNum((s.exams || []).length) + ' امتحانًا</span>' +
          '<span class="badge">' + arNum(n) + ' سؤالًا</span></div>' +
          ((s.exams || []).map(function (e) {
            return '<a class="nav-exam" href="#/s/' + esc(s.id) + '/e/' + esc(e.id) + '">' + esc(e.title) + '</a>';
          }).join('')) + '</article>';
      }).join('') +
      (DATA.notice ? '<div class="callout">' + paras(DATA.notice) + '</div>' : '');
    window.scrollTo(0, 0);
  }

  /* ---------- search ---------- */
  function renderSearch(term) {
    markActive('');
    var t = norm(term).trim();
    var hits = [];
    DATA.sections.forEach(function (s) {
      (s.exams || []).forEach(function (e) {
        (e.questions || []).forEach(function (q, i) {
          var hay = norm([q.matn, q.q, q.word, q.a, q.note].join(' '));
          if (hay.indexOf(t) !== -1) hits.push({ s: s, e: e, q: q, i: i });
        });
      });
    });
    $('#view').innerHTML =
      '<div class="exam-head"><h1>نَتَائِجُ البَحْثِ</h1>' +
      '<div class="exam-meta"><span>' + arNum(hits.length) + ' نتيجة</span></div></div>' +
      (hits.length ? hits.map(function (h, n) {
        return '<div class="q"><div class="q-head"><span class="q-num">' + arNum(n + 1) + '</span>' +
          '<a class="badge" href="#/s/' + esc(h.s.id) + '/e/' + esc(h.e.id) + '">' + esc(h.e.title) + '</a>' +
          (h.q.page ? '<span class="badge">ص ' + arNum(h.q.page) + '</span>' : '') + '</div>' +
          (h.q.type === 'word'
            ? '<p class="q-text">مَا مَعْنَى <span class="word-chip">' + esc(h.q.word) + '</span>؟</p>'
            : '<blockquote class="matn">' + esc(h.q.matn || h.q.q) + '</blockquote>') +
          '<div class="answer"><h4>الْجَوَابُ</h4>' + paras(h.q.a) + '</div></div>';
      }).join('') : '<div class="callout">لا نتائج.</div>');
    window.scrollTo(0, 0);
  }

  var searchBox = $('#search'), tmr;
  searchBox.addEventListener('input', function () {
    clearTimeout(tmr);
    tmr = setTimeout(function () {
      var v = searchBox.value.trim();
      location.hash = v ? '#/q/' + encodeURIComponent(v) : '#/';
    }, 220);
  });

  /* ---------- router ---------- */
  function route() {
    closeNav();
    var h = location.hash.replace(/^#/, '');
    var m = h.match(/^\/s\/([^/]+)\/e\/([^/]+)/);
    if (m) return renderExam(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    var q = h.match(/^\/q\/(.+)$/);
    if (q) return renderSearch(decodeURIComponent(q[1]));
    renderHome();
  }


  /* ---------- comprehensive (mixed) exams ---------- */
  // Seeded, so a question lands in the same mixed exam on every reload.
  function seedOf(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function buildMixed() {
    DATA.sections.forEach(function (s) {
      if (!s.mixed) return;
      var size = s.mixed.size || 40;
      var pool = [];
      (s.exams || []).forEach(function (e) {
        if (e.kind === 'mixed') return;
        (e.questions || []).forEach(function (q) { pool.push(q); });
      });
      if (!pool.length) return;

      var r = rng(seedOf(s.id));
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(r() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      // Every question appears in exactly one mixed exam: full coverage, shuffled.
      var n = Math.ceil(pool.length / size);
      for (var k = 0; k < n; k++) {
        var chunk = pool.slice(k * size, (k + 1) * size);
        var pp = chunk.map(function (q) { return q.page; }).filter(Boolean);
        s.exams.push({
          id: s.id + '-mixed-' + (k + 1),
          kind: 'mixed',
          title: 'امْتِحَانٌ شَامِلٌ (' + arNum(k + 1) + ')',
          pages: pp.length ? 'مِنْ كُلِّ الْقِسْمِ · ص ' + arNum(Math.min.apply(null, pp)) +
                 '\u2013' + arNum(Math.max.apply(null, pp)) : 'مِنْ كُلِّ الْقِسْمِ',
          questions: chunk
        });
      }
    });
  }

  $('#bookTitle').textContent = DATA.title || 'بَنْكُ الاِمْتِحَانَاتِ';
  $('#bookSub').textContent = DATA.subtitle || '';
  document.title = DATA.title || document.title;
  buildMixed();
  renderNav();
  window.addEventListener('hashchange', route);
  route();
})();
