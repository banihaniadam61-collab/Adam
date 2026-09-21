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
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var AR = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function arNum(n) { return String(n).replace(/\d/g, function (d) { return AR[+d]; }); }

  /* ---------- seeded shuffle ---------- */
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
  function shuffled(arr, seedStr) {
    var a = arr.slice(), r = rng(seedOf(seedStr));
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- comprehensive (mixed) exams ---------- */
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
      pool = shuffled(pool, s.id);
      // Every question appears in exactly one mixed exam: full coverage, shuffled.
      var n = Math.ceil(pool.length / size);
      for (var k = 0; k < n; k++) {
        var chunk = pool.slice(k * size, (k + 1) * size);
        var pp = chunk.map(function (q) { return q.page; }).filter(Boolean);
        s.exams.push({
          id: s.id + '-mixed-' + (k + 1),
          kind: 'mixed',
          title: 'امْتِحَانٌ شَامِلٌ (' + arNum(k + 1) + ')',
          pages: pp.length ? 'مِنْ كُلِّ الْقِسْمِ · ص ' +
                 arNum(Math.min.apply(null, pp)) + '–' + arNum(Math.max.apply(null, pp))
               : 'مِنْ كُلِّ الْقِسْمِ',
          questions: chunk
        });
      }
    });
  }

  /* ---------- global question pool (for the custom page-range exams) ---------- */
  var POOL = [], PMIN = 1, PMAX = 1;
  function buildPool() {
    var seen = {};
    DATA.sections.forEach(function (s) {
      (s.exams || []).forEach(function (e) {
        if (e.kind === 'mixed') return;
        (e.questions || []).forEach(function (q) {
          if (seen[q.id]) return;
          seen[q.id] = 1;
          q._sec = s.id;
          POOL.push(q);
        });
      });
    });
    POOL.sort(function (a, b) { return (a.page || 0) - (b.page || 0); });
    if (POOL.length) {
      PMIN = POOL[0].page || 1;
      PMAX = POOL[POOL.length - 1].page || 1;
    }
  }
  // secs: array of section ids, or empty/null for every section.
  function inRange(from, to, secs) {
    var only = secs && secs.length ? secs : null;
    return POOL.filter(function (q) {
      if (q.page < from || q.page > to) return false;
      return !only || only.indexOf(q._sec) !== -1;
    });
  }
  function secsKey(secs) { return secs && secs.length ? secs.join('.') : 'all'; }
  function parseSecs(key) {
    if (!key || key === 'all') return [];
    return key.split('.').filter(function (id) { return !!sectionOf(id); });
  }
  function secsLabel(secs) {
    if (!secs.length) return '\u0643\u064F\u0644\u0651\u064F \u0627\u0644\u0652\u0643\u0650\u062A\u064E\u0627\u0628\u0650';
    return secs.map(function (id) { return (sectionOf(id) || {}).title || id; }).join(' \u00B7 ');
  }

  function sectionOf(sid) {
    return DATA.sections.filter(function (x) { return x.id === sid; })[0] || null;
  }
  function findExam(sid, eid) {
    var s = sectionOf(sid);
    if (!s) return null;
    var e = (s.exams || []).filter(function (x) { return x.id === eid; })[0];
    return e ? { section: s, exam: e } : null;
  }
  function countQuestions(s) {
    return (s.exams || []).reduce(function (n, e) {
      return e.kind === 'mixed' ? n : n + (e.questions || []).length;
    }, 0);
  }
  function pageSpan(s) {
    var pp = [];
    (s.exams || []).forEach(function (e) {
      if (e.kind === 'mixed') return;
      (e.questions || []).forEach(function (q) { if (q.page) pp.push(q.page); });
    });
    if (!pp.length) return null;
    return { from: Math.min.apply(null, pp), to: Math.max.apply(null, pp) };
  }

  /* ---------- theme ---------- */
  var root = document.documentElement;
  var savedTheme = get('theme', '');
  if (savedTheme) root.setAttribute('data-theme', savedTheme);
  $('#themeBtn').addEventListener('click', function () {
    var cur = root.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    set('theme', next);
  });
  $('#homeBtn').addEventListener('click', function () { location.hash = '#/'; });
  $('#backBtn').addEventListener('click', function () {
    if (BACK) location.hash = BACK; else history.back();
  });
  var BACK = '';
  function setBack(hash) {
    BACK = hash || '';
    $('#backBtn').hidden = !BACK;
  }

  /* ================= screens ================= */

  /* ---------- the author's own counsels, quoted from the book ---------- */
  var ADVICE = [
    { t: '\u00AB\u0637\u064E\u0644\u064E\u0628\u064F \u0627\u0644\u0652\u0639\u0650\u0644\u0652\u0645\u0650 \u0641\u064E\u0631\u0650\u064A\u0636\u064E\u0629\u064C \u0639\u064E\u0644\u064E\u0649 \u0643\u064F\u0644\u0651\u0650 \u0645\u064F\u0633\u0652\u0644\u0650\u0645\u064D\u00BB\u060C \u0641\u064E\u064A\u064E\u0646\u0652\u0628\u064E\u063A\u0650\u064A \u0644\u0650\u0637\u064E\u0627\u0644\u0650\u0628\u0650 \u0627\u0644\u0652\u0639\u0650\u0644\u0652\u0645\u0650 \u0623\u064E\u0646\u0652 \u064A\u064E\u0639\u0652\u062A\u064E\u0646\u0650\u064A \u0628\u0650\u062A\u064E\u062D\u0652\u0635\u0650\u064A\u0644\u0650 \u0645\u064E\u0627 \u0641\u0650\u064A\u0647\u0650 \u0648\u064E\u064A\u064F\u062E\u0652\u0644\u0650\u0635\u064E \u0627\u0644\u0646\u0651\u0650\u064A\u0651\u064E\u0629\u064E \u0641\u0650\u064A\u0647\u0650 \u0644\u0650\u0644\u0651\u064E\u0647\u0650 \u0644\u0650\u064A\u064E\u0643\u064F\u0648\u0646\u064E \u0639\u064E\u0645\u064E\u0644\u064F\u0647\u064F \u0645\u064E\u0642\u0652\u0628\u064F\u0648\u0644\u064B\u0627 \u0639\u0650\u0646\u0652\u062F\u064E \u0627\u0644\u0644\u0651\u064E\u0647\u0650.', p: 20 },
    { t: '\u0648\u064E\u064A\u064E\u0646\u0652\u0628\u064E\u063A\u0650\u064A \u0627\u0644\u0650\u0627\u0639\u0652\u062A\u0650\u0646\u064E\u0627\u0621\u064F \u0628\u0650\u0627\u0644\u0637\u0651\u064E\u0647\u064E\u0627\u0631\u064E\u062A\u064E\u064A\u0652\u0646\u0650 \u0627\u0644\u0652\u0648\u064F\u0636\u064F\u0648\u0621\u0650 \u0648\u064E\u0627\u0644\u0652\u063A\u064F\u0633\u0652\u0644\u0650\u060C \u0644\u0650\u0642\u064E\u0648\u0652\u0644\u0650 \u0627\u0644\u0646\u0651\u064E\u0628\u0650\u064A\u0651\u0650 \u0635\u064E\u0644\u0651\u064E\u0649 \u0627\u0644\u0644\u0651\u064E\u0647\u064F \u0639\u064E\u0644\u064E\u064A\u0652\u0647\u0650 \u0648\u064E\u0633\u064E\u0644\u0651\u064E\u0645\u064E: \u00AB\u0627\u0644\u0637\u0651\u064F\u0647\u064F\u0648\u0631\u064F \u0634\u064E\u0637\u0652\u0631\u064F \u0627\u0644\u0652\u0625\u0650\u064A\u0645\u064E\u0627\u0646\u0650\u00BB \u0623\u064E\u064A\u0652 \u0646\u0650\u0635\u0652\u0641\u064F \u0627\u0644\u0652\u0625\u0650\u064A\u0645\u064E\u0627\u0646\u0650.', p: 159 },
    { t: '\u0641\u064E\u064A\u064E\u0646\u0652\u0628\u064E\u063A\u0650\u064A \u0627\u0644\u0652\u0625\u0650\u062D\u0652\u0633\u064E\u0627\u0646\u064F \u0625\u0650\u0644\u064E\u0649 \u0627\u0644\u0652\u062C\u064E\u0627\u0631\u0650 \u0648\u064E\u0627\u0644\u0635\u0651\u064E\u0628\u0652\u0631\u064F \u0639\u064E\u0644\u064E\u0649 \u0623\u064E\u0630\u064E\u0627\u0647\u064F \u0648\u064E\u0628\u064E\u0630\u0652\u0644\u064F \u0627\u0644\u0652\u0645\u064E\u0639\u0652\u0631\u064F\u0648\u0641\u0650 \u0644\u064E\u0647\u064F.', p: 424 }
  ];
  var adviceAt = 0;
  function showAdvice(i) {
    var el = $('#advice');
    if (!el) return;
    adviceAt = ((i % ADVICE.length) + ADVICE.length) % ADVICE.length;
    var a = ADVICE[adviceAt];
    el.classList.remove('swap');
    void el.offsetWidth;              // restart the swap animation
    el.classList.add('swap');
    el.innerHTML = esc(a.t) +
      '<cite>\u0639\u064F\u0645\u0652\u062F\u064E\u0629\u064F \u0627\u0644\u0631\u0651\u064E\u0627\u063A\u0650\u0628\u0650 \u00B7 \u0635 ' + arNum(a.p) +
      ' \u00B7 ' + arNum(adviceAt + 1) + '/' + arNum(ADVICE.length) + '</cite>';
    set('advice', adviceAt);
  }

  /* ---------- home ---------- */
  function renderHome() {
    setBack('');
    var view = $('#view');
    if (!DATA.sections.length) {
      view.innerHTML = '<div class="empty"><h2>لَمْ يُضَفْ مُحْتَوًى بَعْدُ</h2></div>';
      return;
    }
    var total = POOL.length;
    view.innerHTML =
      '<section class="author">' +
        '<img class="author-photo" src="assets/author.jpg" alt="\u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0624\u0644\u0641">' +
        '<div class="author-body">' +
          '<b>\u0627\u0644\u0634\u0651\u064E\u064A\u0652\u062E\u064F \u0639\u064E\u0628\u0652\u062F\u064F \u0627\u0644\u0644\u0647\u0650 \u0627\u0644\u0652\u0647\u064E\u0631\u064E\u0631\u0650\u064A\u0651\u064F</b>' +
          '<i>\u0645\u064F\u0624\u064E\u0644\u0651\u0650\u0641\u064F \u0627\u0644\u0652\u0645\u064E\u062A\u0652\u0646\u0650 \u00B7 \u0627\u0644\u0652\u0645\u064F\u062A\u064E\u0648\u064E\u0641\u0651\u064E\u0649 \u0633\u064E\u0646\u064E\u0629\u064E \u0661\u0664\u0662\u0669\u0647\u0640</i>' +
          '<blockquote id="advice" title="\u0644\u0650\u0648\u064E\u0635\u0650\u064A\u0651\u064E\u0629\u064D \u0623\u064F\u062E\u0652\u0631\u064E\u0649 \u0627\u0636\u0652\u063A\u064E\u0637\u0652"></blockquote>' +
        '</div>' +
      '</section>' +
      '<div class="hero">' +
        '<h1>' + esc(DATA.title || 'بَنْكُ الاِمْتِحَانَاتِ') + '</h1>' +
        '<p>' + arNum(total) + ' سُؤَالًا · صَفَحَاتُ ' +
          arNum(PMIN) + '–' + arNum(PMAX) + '</p>' +
      '</div>' +

      '<a class="big-action" href="#/pick">' +
        '<span class="ba-icon">✂</span>' +
        '<span class="ba-text">' +
          '<b>اخْتَرْ صَفَحَاتِكَ</b>' +
          '<i>مِنْ صَفْحَةٍ إِلَى صَفْحَةٍ — مَثَلًا مِنْ ١٠٠ إِلَى ٢٠٠</i>' +
        '</span>' +
        '<span class="ba-go">›</span>' +
      '</a>' +

      '<div class="search-row">' +
        '<input id="search" type="search" placeholder="بَحْثٌ فِي الْأَسْئِلَةِ…" aria-label="بَحْثٌ">' +
      '</div>' +

      '<h2 class="sec-h">الْأَقْسَامُ</h2>' +
      '<div class="tiles">' +
      DATA.sections.map(function (s) {
        var n = countQuestions(s);
        var exams = (s.exams || []).length;
        return '<a class="tile" href="#/s/' + esc(s.id) + '">' +
          '<b>' + esc(s.title) + '</b>' +
          '<span class="tile-meta">' +
            (s.pages ? '<span class="pill">ص ' + esc(s.pages) + '</span>' : '') +
            '<span class="pill">' + arNum(exams) + ' امتحانًا</span>' +
            '<span class="pill">' + arNum(n) + ' سؤالًا</span>' +
          '</span>' +
        '</a>';
      }).join('') +
      '</div>';
    wireSearch();
    showAdvice(parseInt(get('advice', 0), 10) + 1);
    var adv = $('#advice');
    if (adv) adv.addEventListener('click', function () { showAdvice(adviceAt + 1); });
    window.scrollTo(0, 0);
  }

  /* ---------- one section ---------- */
  function renderSection(sid) {
    var s = sectionOf(sid);
    if (!s) { location.hash = '#/'; return; }
    setBack('#/');
    var ranges = (s.exams || []).filter(function (e) { return e.kind !== 'mixed'; });
    var mixed = (s.exams || []).filter(function (e) { return e.kind === 'mixed'; });

    // group range exams by their page span, so each span is one card
    var order = [], byspan = {};
    ranges.forEach(function (e) {
      var k = e.pages || '';
      if (!byspan[k]) { byspan[k] = []; order.push(k); }
      byspan[k].push(e);
    });

    var span = pageSpan(s);
    var html =
      '<div class="hero small">' +
        '<h1>' + esc(s.title) + '</h1>' +
        '<p>' + (s.pages ? 'صَفَحَاتُ ' + esc(s.pages) + ' · ' : '') +
          arNum(countQuestions(s)) + ' سُؤَالًا</p>' +
      '</div>';

    if (span) {
      html += '<a class="big-action slim" href="#/pick/' + span.from + '-' + span.to + '-15-' + esc(s.id) + '">' +
        '<span class="ba-icon">✂</span>' +
        '<span class="ba-text"><b>امْتِحَانٌ بِصَفَحَاتٍ تَخْتَارُهَا</b>' +
        '<i>دَاخِلَ هَذَا الْقِسْمِ</i></span>' +
        '<span class="ba-go">›</span></a>';
    }

    if (order.length) {
      html += '<h2 class="sec-h">امْتِحَانَاتُ الصَّفَحَاتِ</h2><div class="span-cards">';
      html += order.map(function (k) {
        var group = byspan[k];
        var parts = group.map(function (e, i) {
          return '<a class="pchip" href="#/s/' + esc(s.id) + '/e/' + esc(e.id) + '">' +
            (group.length > 1 ? 'جـ ' + arNum(i + 1) : 'ابْدَأْ') +
            '</a>';
        }).join('');
        var n = group.reduce(function (a, e) { return a + (e.questions || []).length; }, 0);
        return '<div class="span-card">' +
          '<div class="span-head"><b>ص ' + esc(k) + '</b>' +
            '<span class="pill">' + arNum(n) + ' سؤالًا</span></div>' +
          '<div class="pchips">' + parts + '</div></div>';
      }).join('');
      html += '</div>';
    }

    if (mixed.length) {
      html += '<h2 class="sec-h">الاِمْتِحَانَاتُ الشَّامِلَةُ' +
        '<small>مَخْلُوطَةٌ مِنْ كُلِّ الْقِسْمِ</small></h2>';
      html += '<div class="num-grid">' + mixed.map(function (e, i) {
        return '<a class="num-chip" href="#/s/' + esc(s.id) + '/e/' + esc(e.id) + '" title="' + esc(e.title) + '">' +
          arNum(i + 1) + '</a>';
      }).join('') + '</div>';
    }

    $('#view').innerHTML = html;
    window.scrollTo(0, 0);
  }

  /* ---------- page-range picker ---------- */
  var PICK = { from: 0, to: 0, size: 15, secs: [] };
  function clampPick() {
    PICK.from = Math.max(PMIN, Math.min(PMAX, PICK.from || PMIN));
    PICK.to = Math.max(PMIN, Math.min(PMAX, PICK.to || PMAX));
    if (PICK.from > PICK.to) { var t = PICK.from; PICK.from = PICK.to; PICK.to = t; }
  }
  // Union of the page spans of the selected sections (all of them when none is selected).
  function spanOfSecs(secs) {
    var lo = null, hi = null;
    DATA.sections.forEach(function (s) {
      if (secs.length && secs.indexOf(s.id) === -1) return;
      var sp = pageSpan(s);
      if (!sp) return;
      lo = lo === null ? sp.from : Math.min(lo, sp.from);
      hi = hi === null ? sp.to : Math.max(hi, sp.to);
    });
    return lo === null ? { from: PMIN, to: PMAX } : { from: lo, to: hi };
  }

  function renderPicker(from, to, secs) {
    setBack('#/');
    if (secs) PICK.secs = secs;
    if (from) { PICK.from = from; PICK.to = to; }
    else if (!PICK.from) {
      PICK.from = parseInt(get('pick.from', PMIN), 10) || PMIN;
      PICK.to = parseInt(get('pick.to', PMAX), 10) || PMAX;
      PICK.size = parseInt(get('pick.size', 15), 10) || 15;
      PICK.secs = parseSecs(get('pick.secs', 'all'));
    }
    clampPick();

    var sizes = [10, 15, 20, 30, 0];
    var sizeLabels = ['\u0661\u0660', '\u0661\u0665', '\u0662\u0660', '\u0663\u0660', '\u0627\u0644\u0652\u0643\u064F\u0644\u0651'];

    $('#view').innerHTML =
      '<div class="hero small">' +
        '<h1>\u0627\u062E\u0652\u062A\u064E\u0631\u0652 \u0627\u0645\u0652\u062A\u0650\u062D\u064E\u0627\u0646\u064E\u0643\u064E</h1>' +
        '<p>\u062D\u064E\u062F\u0651\u0650\u062F\u0650 \u0627\u0644\u0652\u0623\u064E\u0642\u0652\u0633\u064E\u0627\u0645\u064E \u0648\u064E\u0627\u0644\u0635\u0651\u064E\u0641\u064E\u062D\u064E\u0627\u062A\u0650 \u0627\u0644\u0651\u064E\u062A\u0650\u064A \u062A\u064F\u0631\u0650\u064A\u062F\u064F</p>' +
      '</div>' +

      '<div class="picker">' +
        '<div class="pk-label">\u0627\u0644\u0652\u0623\u064E\u0642\u0652\u0633\u064E\u0627\u0645\u064F \u2014 \u064A\u064F\u0645\u0652\u0643\u0650\u0646\u064F \u0627\u062E\u0652\u062A\u0650\u064A\u064E\u0627\u0631\u064F \u0623\u064E\u0643\u0652\u062B\u064E\u0631\u064E \u0645\u0650\u0646\u0652 \u0642\u0650\u0633\u0652\u0645\u064D</div>' +
        '<div class="quick secs">' +
          '<button class="qbtn' + (PICK.secs.length ? '' : ' on') + '" type="button" data-allsecs="1">' +
            '\u0643\u064F\u0644\u0651\u064F \u0627\u0644\u0652\u0643\u0650\u062A\u064E\u0627\u0628\u0650</button>' +
          DATA.sections.map(function (s) {
            if (!pageSpan(s)) return '';
            var on = PICK.secs.indexOf(s.id) !== -1;
            return '<button class="qbtn' + (on ? ' on' : '') + '" type="button" data-sec="' + esc(s.id) + '">' +
              esc(s.title.replace(/^\u0643\u0650\u062A\u064E\u0627\u0628\u064F\s*/, '')) + '</button>';
          }).join('') +
        '</div>' +

        '<div class="pk-label">\u0627\u0644\u0635\u0651\u064E\u0641\u064E\u062D\u064E\u0627\u062A\u064F</div>' +
        '<div class="pk-row">' +
          numBox('from', '\u0645\u0650\u0646\u0652 \u0635\u064E\u0641\u0652\u062D\u064E\u0629\u0650', PICK.from) +
          numBox('to', '\u0625\u0650\u0644\u064E\u0649 \u0635\u064E\u0641\u0652\u062D\u064E\u0629\u0650', PICK.to) +
        '</div>' +
        '<label class="sl"><span>\u0645\u0650\u0646\u0652</span>' +
          '<input type="range" id="slFrom" min="' + PMIN + '" max="' + PMAX + '" value="' + PICK.from + '"></label>' +
        '<label class="sl"><span>\u0625\u0650\u0644\u064E\u0649</span>' +
          '<input type="range" id="slTo" min="' + PMIN + '" max="' + PMAX + '" value="' + PICK.to + '"></label>' +

        '<div class="pk-label">\u0642\u0650\u0637\u064E\u0639\u064C \u0633\u064E\u0631\u0650\u064A\u0639\u064E\u0629\u064C</div>' +
        '<div class="quick">' + blockButtons() + '</div>' +

        '<div class="pk-label">\u0639\u064E\u062F\u064E\u062F\u064F \u0627\u0644\u0623\u064E\u0633\u0652\u0626\u0650\u0644\u064E\u0629\u0650 \u0641\u0650\u064A \u0643\u064F\u0644\u0651\u0650 \u0627\u0645\u0652\u062A\u0650\u062D\u064E\u0627\u0646\u064D</div>' +
        '<div class="quick sizes">' + sizes.map(function (n, i) {
          return '<button class="qbtn' + (PICK.size === n ? ' on' : '') + '" type="button" data-size="' + n + '">' +
            sizeLabels[i] + '</button>';
        }).join('') + '</div>' +

        '<div class="pk-summary" id="pkSum"></div>' +
        '<button class="btn primary huge" id="goBtn" type="button">\u0627\u0628\u0652\u062F\u064E\u0623\u0650 \u0627\u0644\u0627\u0650\u0645\u0652\u062A\u0650\u062D\u064E\u0627\u0646\u064E</button>' +
      '</div>';

    function numBox(key, label, val) {
      return '<div class="numbox">' +
        '<span class="nb-label">' + label + '</span>' +
        '<div class="nb-ctrl">' +
          '<button class="nb-btn" type="button" data-step="-1" data-key="' + key + '">\u2212</button>' +
          '<input class="nb-in" id="in_' + key + '" type="number" inputmode="numeric" min="' + PMIN + '" max="' + PMAX + '" value="' + val + '">' +
          '<button class="nb-btn" type="button" data-step="1" data-key="' + key + '">+</button>' +
        '</div>' +
        '<div class="nb-jump">' +
          '<button class="nb-small" type="button" data-step="-10" data-key="' + key + '">\u2212\u0661\u0660</button>' +
          '<button class="nb-small" type="button" data-step="10" data-key="' + key + '">+\u0661\u0660</button>' +
        '</div>' +
      '</div>';
    }

    // 50-page blocks across whatever the selected sections span.
    function blockButtons() {
      var sp = spanOfSecs(PICK.secs);
      var out = ['<button class="qbtn" type="button" data-from="' + sp.from + '" data-to="' + sp.to + '">' +
        '\u0643\u064F\u0644\u0651\u064F \u0627\u0644\u0645\u064F\u062E\u0652\u062A\u064E\u0627\u0631\u0650</button>'];
      for (var p = Math.floor(sp.from / 50) * 50; p < sp.to; p += 50) {
        var a = Math.max(p, sp.from), b = Math.min(p + 50, sp.to);
        out.push('<button class="qbtn" type="button" data-from="' + a + '" data-to="' + b + '">' +
          arNum(a) + '\u2013' + arNum(b) + '</button>');
      }
      return out.join('');
    }

    function sync() {
      clampPick();
      $('#in_from').value = PICK.from;
      $('#in_to').value = PICK.to;
      $('#slFrom').value = PICK.from;
      $('#slTo').value = PICK.to;
      var hits = inRange(PICK.from, PICK.to, PICK.secs);
      var size = PICK.size || hits.length || 1;
      var parts = hits.length ? Math.ceil(hits.length / size) : 0;
      $('#pkSum').innerHTML = hits.length
        ? esc(secsLabel(PICK.secs)) + '<br>' +
          '\u0645\u0650\u0646\u0652 \u0635\u064E\u0641\u0652\u062D\u064E\u0629\u0650 <b>' + arNum(PICK.from) + '</b> \u0625\u0650\u0644\u064E\u0649 <b>' + arNum(PICK.to) + '</b>' +
          '<br>' + arNum(hits.length) + ' \u0633\u064F\u0624\u064E\u0627\u0644\u064B\u0627 \u00B7 ' +
          arNum(parts) + ' \u0627\u0645\u0652\u062A\u0650\u062D\u064E\u0627\u0646\u064B\u0627'
        : '<span class="warn">\u0644\u064E\u0627 \u0623\u064E\u0633\u0652\u0626\u0650\u0644\u064E\u0629\u064E \u0641\u0650\u064A \u0647\u064E\u0630\u064E\u0627 \u0627\u0644\u0645\u064E\u062F\u064E\u0649</span>';
      $('#goBtn').disabled = !hits.length;
      set('pick.from', PICK.from); set('pick.to', PICK.to);
      set('pick.size', PICK.size); set('pick.secs', secsKey(PICK.secs));
    }
    function refreshBlocks() {
      var host = $('.picker .quick:not(.secs):not(.sizes)');
      if (host) host.innerHTML = blockButtons();
    }

    var pk = $('.picker');
    pk.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-step')) {
        PICK[b.getAttribute('data-key')] += parseInt(b.getAttribute('data-step'), 10);
        sync();
      } else if (b.hasAttribute('data-sec')) {
        var id = b.getAttribute('data-sec');
        var i = PICK.secs.indexOf(id);
        if (i === -1) PICK.secs.push(id); else PICK.secs.splice(i, 1);
        var sp = spanOfSecs(PICK.secs);
        PICK.from = sp.from; PICK.to = sp.to;
        $$('.secs .qbtn').forEach(function (x) {
          var sid = x.getAttribute('data-sec');
          x.classList.toggle('on', sid ? PICK.secs.indexOf(sid) !== -1 : !PICK.secs.length);
        });
        refreshBlocks();
        sync();
      } else if (b.hasAttribute('data-allsecs')) {
        PICK.secs = [];
        var all = spanOfSecs([]);
        PICK.from = all.from; PICK.to = all.to;
        $$('.secs .qbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
        refreshBlocks();
        sync();
      } else if (b.hasAttribute('data-from')) {
        PICK.from = parseInt(b.getAttribute('data-from'), 10);
        PICK.to = parseInt(b.getAttribute('data-to'), 10);
        sync();
      } else if (b.hasAttribute('data-size')) {
        PICK.size = parseInt(b.getAttribute('data-size'), 10);
        $$('.sizes .qbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
        sync();
      } else if (b.id === 'goBtn') {
        location.hash = '#/c/' + PICK.from + '-' + PICK.to + '-' + PICK.size + '-' + secsKey(PICK.secs);
      }
    });
    pk.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.id === 'in_from') { PICK.from = parseInt(t.value, 10) || PMIN; sync(); }
      if (t.id === 'in_to') { PICK.to = parseInt(t.value, 10) || PMAX; sync(); }
      if (t.id === 'slFrom') { PICK.from = parseInt(t.value, 10); sync(); }
      if (t.id === 'slTo') { PICK.to = parseInt(t.value, 10); sync(); }
    });
    sync();
    window.scrollTo(0, 0);
  }

  /* ---------- custom exams built from a page range + chosen sections ---------- */
  function customExams(from, to, size, secs) {
    var hits = inRange(from, to, secs);
    if (!hits.length) return [];
    var pool = shuffled(hits, 'c:' + from + ':' + to + ':' + size + ':' + secsKey(secs));
    var per = size > 0 ? size : pool.length;
    var out = [];
    for (var k = 0; k * per < pool.length; k++) out.push(pool.slice(k * per, (k + 1) * per));
    return out;
  }
  function customSpec(from, to, size, secs) {
    return from + '-' + to + '-' + size + '-' + secsKey(secs);
  }

  function renderCustomIndex(from, to, size, secs) {
    setBack('#/pick/' + customSpec(from, to, size, secs));
    PICK.from = from; PICK.to = to; PICK.size = size; PICK.secs = secs;
    var parts = customExams(from, to, size, secs);
    if (!parts.length) { location.hash = '#/pick'; return; }
    if (parts.length === 1) { renderCustomExam(from, to, size, secs, 0); return; }
    var total = parts.reduce(function (a, p) { return a + p.length; }, 0);
    var spec = customSpec(from, to, size, secs);
    $('#view').innerHTML =
      '<div class="hero small">' +
        '<h1>\u0635\u064E\u0641\u064E\u062D\u064E\u0627\u062A\u064F ' + arNum(from) + '\u2013' + arNum(to) + '</h1>' +
        '<p>' + esc(secsLabel(secs)) + '</p>' +
        '<p>' + arNum(total) + ' \u0633\u064F\u0624\u064E\u0627\u0644\u064B\u0627 \u00B7 ' + arNum(parts.length) +
          ' \u0627\u0645\u0652\u062A\u0650\u062D\u064E\u0627\u0646\u064B\u0627</p>' +
      '</div>' +
      '<div class="num-grid big">' + parts.map(function (p, i) {
        return '<a class="num-chip" href="#/c/' + spec + '/' + (i + 1) + '">' +
          arNum(i + 1) + '<small>' + arNum(p.length) + '</small></a>';
      }).join('') + '</div>' +
      '<div class="foot-actions"><a class="btn" href="#/pick/' + spec + '">\u062A\u064E\u063A\u0652\u064A\u0650\u064A\u0631\u064F \u0627\u0644\u0627\u062E\u0652\u062A\u0650\u064A\u064E\u0627\u0631\u0650</a></div>';
    window.scrollTo(0, 0);
  }

  function renderCustomExam(from, to, size, secs, idx) {
    var parts = customExams(from, to, size, secs);
    if (!parts.length) { location.hash = '#/pick'; return; }
    if (idx >= parts.length) idx = 0;
    var spec = customSpec(from, to, size, secs);
    var back = parts.length > 1 ? '#/c/' + spec : '#/pick/' + spec;
    showExam({
      id: 'c-' + spec + '-' + (idx + 1),
      title: '\u0635\u064E\u0641\u064E\u062D\u064E\u0627\u062A\u064F ' + arNum(from) + '\u2013' + arNum(to) +
        (parts.length > 1 ? ' \u2014 \u0627\u0644\u062C\u064F\u0632\u0652\u0621\u064F ' + arNum(idx + 1) : ''),
      pages: arNum(from) + '\u2013' + arNum(to),
      questions: parts[idx]
    }, secsLabel(secs), back,
      parts.length > 1 && idx + 1 < parts.length ? '#/c/' + spec + '/' + (idx + 2) : '');
  }

  /* ---------- question rendering ---------- */
  function qHTML(q, i) {
    var badge = q.type === 'word'
      ? '<span class="badge t-word">معنى كلمة</span>'
      : '<span class="badge t-matn">قول المؤلّف</span>';
    if (q.src === 'hashiya') badge += '<span class="badge t-src">مِنَ الحَاشِيَةِ</span>';

    var body = q.type === 'word'
      ? '<p class="q-text">مَا مَعْنَى <span class="word-chip">' + esc(q.word) + '</span>؟</p>'
      : '<p class="q-text">' + esc(q.q || 'قَالَ المُؤَلِّفُ رَحِمَهُ اللَّهُ — اشْرَحْ كَلَامَهُ شَرْحًا تَامًّا') + '</p>' +
        (q.matn ? '<blockquote class="matn">' + esc(q.matn) + '</blockquote>' : '');

    return '<article class="q" id="q-' + esc(q.id) + '" data-qid="' + esc(q.id) + '">' +
      '<div class="q-head"><span class="q-num">' + arNum(i + 1) + '</span>' + badge +
        (q.page ? '<span class="badge">ص ' + arNum(q.page) + '</span>' : '') + '</div>' +
      body +
      '<button class="btn reveal" type="button" aria-expanded="false">إظْهَارُ الجَوَابِ</button>' +
      '<div class="ans-wrap" hidden>' +
        '<div class="answer"><h4>الْجَوَابُ</h4>' + paras(q.a) + '</div>' +
        (q.note ? '<div class="note"><h4>حَاشِيَةُ الصَّفْحَةِ — زِيَادَةُ عِلْمٍ لِلْمُطَالَعَةِ فَقَط، لَيْسَتْ مِنَ الْجَوَابِ</h4>' + paras(q.note) + '</div>' : '') +
        '<div class="grade">' +
          '<button class="btn" type="button" data-g="ok">أَجَبْتُ صَحِيحًا</button>' +
          '<button class="btn" type="button" data-g="again">أُعِيدُ مُرَاجَعَتَهُ</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function showExam(e, subtitle, back, nextHash) {
    setBack(back || '#/');
    var qs = e.questions || [];
    var view = $('#view');
    view.innerHTML =
      '<div class="exam-head">' +
        '<h1>' + esc(e.title) + '</h1>' +
        '<div class="exam-meta">' +
          (subtitle ? '<span>' + esc(subtitle) + '</span>' : '') +
          (e.pages ? '<span>ص ' + esc(e.pages) + '</span>' : '') +
          '<span>' + arNum(qs.length) + ' سُؤَالًا</span>' +
        '</div>' +
        '<div class="toolbar">' +
          '<button class="btn primary" id="showAll" type="button">إظْهَارُ كُلِّ الأَجْوِبَةِ</button>' +
          '<button class="btn" id="hideAll" type="button">إخْفَاءُ كُلِّهَا</button>' +
          '<button class="btn" id="printBtn" type="button">طِبَاعَة</button>' +
          '<button class="btn" id="resetBtn" type="button">تَصْفِيرُ التَّقْيِيمِ</button>' +
        '</div>' +
        '<div class="progress"><i id="bar"></i></div>' +
        '<div class="progress-label" id="barLabel"></div>' +
      '</div>' +
      (qs.length ? qs.map(qHTML).join('') : '<div class="callout">لا توجد أسئلة.</div>') +
      '<div class="foot-actions">' +
        (nextHash ? '<a class="btn primary" href="' + esc(nextHash) + '">الاِمْتِحَانُ التَّالِي</a>' : '') +
        '<a class="btn" href="' + esc(back || '#/') + '">رُجُوعٌ</a>' +
      '</div>';

    qs.forEach(function (q) {
      var g = get('g:' + q.id, '');
      if (!g) return;
      var card = document.getElementById('q-' + q.id);
      if (!card) return;
      var b = card.querySelector('.grade .btn[data-g="' + g + '"]');
      if (b) b.classList.add('on');
    });
    updateBar(qs);

    $('#showAll').addEventListener('click', function () { toggleAll(true); });
    $('#hideAll').addEventListener('click', function () { toggleAll(false); });
    $('#printBtn').addEventListener('click', function () { toggleAll(true); window.print(); });
    $('#resetBtn').addEventListener('click', function () {
      qs.forEach(function (q) { set('g:' + q.id, ''); });
      showExam(e, subtitle, back, nextHash);
    });
    view.addEventListener('click', onCardClick);
    view._qs = qs;
    window.scrollTo(0, 0);
  }

  function renderExam(sid, eid) {
    var found = findExam(sid, eid);
    if (!found) { location.hash = '#/'; return; }
    showExam(found.exam, found.section.title, '#/s/' + sid, '');
  }

  function toggleAll(show) {
    $$('.q').forEach(function (card) {
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
    if (ev.target.classList.contains('reveal')) {
      var w = card.querySelector('.ans-wrap');
      var show = w.hidden;
      w.hidden = !show;
      ev.target.setAttribute('aria-expanded', String(show));
      ev.target.textContent = show ? 'إخفَاءُ الجَوَابِ' : 'إظْهَارُ الجَوَابِ';
      return;
    }
    var gb = ev.target.closest ? ev.target.closest('.grade .btn') : null;
    if (gb) {
      var key = 'g:' + card.getAttribute('data-qid');
      var want = gb.getAttribute('data-g');
      var next = get(key, '') === want ? '' : want;
      set(key, next);
      $$('.grade .btn', card).forEach(function (b) {
        b.classList.toggle('on', !!next && b.getAttribute('data-g') === next);
      });
      updateBar($('#view')._qs || []);
    }
  }

  function updateBar(qs) {
    var done = qs.filter(function (q) { return get('g:' + q.id, ''); }).length;
    var ok = qs.filter(function (q) { return get('g:' + q.id, '') === 'ok'; }).length;
    var pct = qs.length ? Math.round((done / qs.length) * 100) : 0;
    var bar = $('#bar'), lab = $('#barLabel');
    if (bar) bar.style.width = pct + '%';
    if (lab) lab.textContent = 'أَجَبْتَ عَنْ ' + arNum(done) +
      ' مِنْ ' + arNum(qs.length) + '، مِنْهَا ' + arNum(ok) +
      ' صَحِيحَةٌ.';
  }

  /* ---------- search ---------- */
  function wireSearch() {
    var box = $('#search');
    if (!box) return;
    var tmr;
    box.addEventListener('input', function () {
      clearTimeout(tmr);
      tmr = setTimeout(function () {
        var v = box.value.trim();
        if (v.length >= 2) location.hash = '#/q/' + encodeURIComponent(v);
      }, 300);
    });
  }

  function renderSearch(term) {
    setBack('#/');
    var t = norm(term).trim();
    var hits = POOL.filter(function (q) {
      return norm([q.matn, q.q, q.word, q.a, q.note].join(' ')).indexOf(t) !== -1;
    }).slice(0, 120);
    $('#view').innerHTML =
      '<div class="hero small"><h1>نَتَائِجُ البَحْثِ</h1>' +
      '<p>' + esc(term) + ' · ' + arNum(hits.length) + ' نتيجة</p></div>' +
      '<div class="search-row"><input id="search" type="search" value="' + esc(term) + '"></div>' +
      (hits.length ? hits.map(function (q, n) {
        return '<div class="q"><div class="q-head"><span class="q-num">' + arNum(n + 1) + '</span>' +
          (q.page ? '<span class="badge">ص ' + arNum(q.page) + '</span>' : '') + '</div>' +
          (q.type === 'word'
            ? '<p class="q-text">مَا مَعْنَى <span class="word-chip">' + esc(q.word) + '</span>؟</p>'
            : '<blockquote class="matn">' + esc(q.matn || q.q) + '</blockquote>') +
          '<div class="answer"><h4>الْجَوَابُ</h4>' + paras(q.a) + '</div></div>';
      }).join('') : '<div class="callout">لا نتائج.</div>');
    wireSearch();
    window.scrollTo(0, 0);
  }

  /* ---------- router ---------- */
  function route() {
    var h = location.hash.replace(/^#/, '');
    var m;
    if ((m = h.match(/^\/s\/([^/]+)\/e\/([^/]+)/))) return renderExam(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if ((m = h.match(/^\/s\/([^/]+)$/))) return renderSection(decodeURIComponent(m[1]));
    if ((m = h.match(/^\/c\/(\d+)-(\d+)-(\d+)-([^/]+)\/(\d+)$/)))
      return renderCustomExam(+m[1], +m[2], +m[3], parseSecs(decodeURIComponent(m[4])), +m[5] - 1);
    if ((m = h.match(/^\/c\/(\d+)-(\d+)-(\d+)-([^/]+)$/)))
      return renderCustomIndex(+m[1], +m[2], +m[3], parseSecs(decodeURIComponent(m[4])));
    if ((m = h.match(/^\/pick\/(\d+)-(\d+)-(\d+)-([^/]+)$/)))
      return renderPicker(+m[1], +m[2], parseSecs(decodeURIComponent(m[4])));
    if ((m = h.match(/^\/pick\/(\d+)\/(\d+)$/))) return renderPicker(+m[1], +m[2], []);
    if (h.indexOf('/pick') === 0) return renderPicker();
    if ((m = h.match(/^\/q\/(.+)$/))) return renderSearch(decodeURIComponent(m[1]));
    renderHome();
  }

  $('#bookTitle').textContent = DATA.title || 'بَنْكُ الاِمْتِحَانَاتِ';
  $('#bookSub').textContent = DATA.subtitle || '';
  document.title = DATA.title || document.title;
  buildMixed();
  buildPool();
  window.addEventListener('hashchange', route);
  route();
})();
