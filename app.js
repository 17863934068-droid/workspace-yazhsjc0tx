/* ============================================================
 * Red Echo Demo · 阶段2 交互脚本
 * 职责：搜索流程（路由→瀑布流/空结果）、搜索历史、
 *       Echo Bubble（胶囊展开→收缩星标、拖动吸边、点击开半屏层）、
 *       收藏半屏层（占位版，阶段3换叠卡/网格/手势）
 * ============================================================ */

(function () {
  'use strict';

  /* ---------- 状态栏时钟 ---------- */
  function tickClock() {
    var el = document.getElementById('sbTime');
    if (!el) return;
    var d = new Date();
    el.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  tickClock();
  setInterval(tickClock, 20000);

  /* ---------- 引用 ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var appEl = document.querySelector('.app');
  var phoneEl = document.querySelector('.phone');

  /* ---------- 桌面端自适应缩放：保证手机完整显示在视口内 ----------
   * 缩放只影响视觉，所有交互坐标按 1/FIT 换算回布局像素。 */
  var FIT = 1;
  function fitScale() {
    if (window.innerWidth <= 520) { FIT = 1; phoneEl.style.removeProperty('--fit'); return; }
    FIT = Math.min(1, (window.innerHeight - 36) / 864, (window.innerWidth - 32) / 410);
    phoneEl.style.setProperty('--fit', String(FIT));
  }

  var input = $('searchInput');
  var pageResults = $('pageResults');
  var resQuery = $('resQuery');
  var wfCols = $('wfCols');
  var wfColA = $('wfColA');
  var wfColB = $('wfColB');
  var wfEmpty = $('wfEmpty');
  var wfWrap = $('wfWrap');
  var histChips = $('histChips');

  /* ---------- 应用状态 ---------- */
  var state = {
    query: '',
    scenario: null, // 's1' | 's2' | 's3' | null
  };
  var historyList = ['摄影审美', '胶片漏光', '室内绿植养护', '云南雨季自由行', '街头构图灵感', '雨夜光轨怎么拍'];

  /* ============================================================
   * 瀑布流（阶段1）
   * ============================================================ */

  var RATIO_CYCLE = [0.75, 0.82, 0.68, 0.84, 0.76, 0.72, 0.80, 0.66, 0.78, 0.82];
  var HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.4-4.8-9.6-8.9C.9 8.7 2.4 5.6 5.4 5c1.9-.4 3.8.5 4.9 2 1.1-1.5 3-2.4 4.9-2 3 .6 4.5 3.7 3 6.6-2.2 4.1-9.6 8.9-9.6 8.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

  function hueOf(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }
  function avatarStyle(name) {
    var h = hueOf(name);
    return 'background:hsl(' + h + ',62%,90%);color:hsl(' + h + ',45%,42%)';
  }
  /* 头像 HTML：有图片映射的作者渲染 <img>，其余走原文字圆点 */
  function avatarOf(name, cls) {
    var src = (DATA.avatars || {})[name];
    if (src) return '<img class="' + cls + ' av-img" src="' + src + '" alt="' + name + '" draggable="false">';
    return '<span class="' + cls + '" style="' + avatarStyle(name) + '">' + name.charAt(0) + '</span>';
  }

  function cardEl(item, ratio) {
    var el = document.createElement('div');
    el.className = 'wfcard';

    var imgw = document.createElement('div');
    imgw.className = 'wfimg';
    imgw.style.aspectRatio = (1 / ratio).toFixed(4);
    var im = document.createElement('img');
    im.src = item.cover;
    im.alt = item.title;
    im.loading = 'lazy';
    im.draggable = false;
    /* 图片真实比例优先（模拟小红书按原图比例展示，零裁切） */
    im.onload = function () {
      if (im.naturalWidth && im.naturalHeight) {
        imgw.style.aspectRatio = (im.naturalWidth / im.naturalHeight).toFixed(4);
      }
    };
    imgw.appendChild(im);

    var t = document.createElement('div');
    t.className = 'wftitle';
    t.textContent = item.title;

    var f = document.createElement('div');
    f.className = 'wffoot';
    f.innerHTML =
      avatarOf(item.author, 'wfav') +
      '<span class="wfauthor"></span>' +
      '<span class="wflike">' + HEART + '<b></b></span>';
    f.querySelector('.wfauthor').textContent = item.author;
    f.querySelector('.wflike b').textContent = item.likes;

    el.appendChild(imgw);
    el.appendChild(t);
    el.appendChild(f);
    el.addEventListener('click', function () { openDetail(noteDetailOf(item)); });
    return el;
  }

  function renderResults() {
    resQuery.textContent = state.query;
    wfColA.innerHTML = '';
    wfColB.innerHTML = '';

    var sc = state.scenario ? DATA.scenarios[state.scenario] : null;

    if (sc && sc.results.length) {
      wfCols.style.display = 'flex';
      wfEmpty.classList.remove('show');

      var colW = (wfCols.clientWidth - 10) / 2 || 170;
      var ha = 0, hb = 0;
      sc.results.forEach(function (item, i) {
        var ratio = RATIO_CYCLE[i % RATIO_CYCLE.length];
        var el = cardEl(item, ratio);
        var hCard = colW * ratio + 6 + 38 + 5 + 20 + 13;
        if (ha <= hb) { wfColA.appendChild(el); ha += hCard; }
        else { wfColB.appendChild(el); hb += hCard; }
      });
    } else {
      wfCols.style.display = 'none';
      wfEmpty.classList.add('show');
    }
  }

  /* ============================================================
   * Echo Bubble（阶段2）
   * ============================================================ */

  var bubble = $('eBubble');
  var ebNum = $('ebNum');
  var ebFan = $('ebFan');
  var ebTxt = $('ebTxt');

  var BUB = {
    SIZE: 68,
    EDGE: 12,
    side: 'right',
    top: null,
    visible: false,
    introPlayed: false,
    mode: 'circle',
    timer: null,
    hideT: null,
    drag: null,
  };

  function appSize() {
    return { w: appEl.offsetWidth, h: appEl.offsetHeight };
  }

  function clampTop(t, s) {
    return Math.min(Math.max(t, 60), s.h - BUB.SIZE - 96);
  }

  function currentWidth() {
    if (BUB.mode === 'capsule') {
      var w = parseFloat(bubble.style.width);
      return w > 0 ? w : BUB.SIZE;
    }
    return BUB.SIZE;
  }

  function placeBubble() {
    var s = appSize();
    var w = currentWidth();
    var top = clampTop(BUB.top != null ? BUB.top : s.h - 194, s);
    /* 右吸附时右边缘对齐（胶囊向左生长），左吸附时左边缘对齐 */
    var left = BUB.side === 'right' ? s.w - w - BUB.EDGE : BUB.EDGE;
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }

  function setBubbleMode(mode) {
    clearTimeout(BUB.hideT);
    BUB.mode = mode;
    if (mode === 'capsule') {
      bubble.classList.add('capsule');
      ebFan.style.display = ''; /* 清除收缩时留下的 inline:none，回到胶囊布局 */
      ebTxt.style.display = '';
      var tw = ebTxt.getBoundingClientRect().width / FIT; /* 除以缩放系数还原布局像素 */
      /* 宽度 = 左内边距12 + 封面堆叠60 + 间距9 + 文案tw + 间距9 + 星标球52 + 右内边距7 */
      bubble.style.width = Math.round(149 + tw) + 'px';
    } else {
      bubble.classList.remove('capsule');
      bubble.style.width = BUB.SIZE + 'px';
      /* 收缩动画（0.45s）结束后，封面与文案彻底退出布局，不保留占位宽度 */
      BUB.hideT = setTimeout(function () {
        if (BUB.mode !== 'capsule') { ebFan.style.display = 'none'; ebTxt.style.display = 'none'; }
      }, 500);
    }
    placeBubble(); /* 宽度变化后重新锚定边缘 */
  }

  function showBubble() {
    clearTimeout(BUB.timer);
    var sc = state.scenario && DATA.scenarios[state.scenario];
    var cnt = (sc && sc.recall && sc.recall.qualified.length) || 0;
    ebNum.textContent = cnt;
    /* 扇形封面堆叠：前排 = 最相关（第1篇），后排 = 第2/3篇 */
    var qs = (sc && sc.recall && sc.recall.qualified) || [];
    var phs = ebFan.querySelectorAll('.eb-ph');
    var order = [qs[1], qs[2], qs[0]];
    for (var pi = 0; pi < phs.length; pi++) {
      var cid = order[pi] || qs[0];
      if (cid && DATA.collections[cid]) phs[pi].src = DATA.collections[cid].cover;
    }
    placeBubble();
    bubble.classList.add('show');
    BUB.visible = true;
    if (!BUB.introPlayed) {
      /* 首次出现：胶囊展开（约0.45s）→ 完全展开后保持4s → 收缩（约0.45s）为圆形星标+角标。
       * 4s 为完全展开后的停留时长，不含展开/收缩动画；同一搜索仅播放一次，
       * 滚动、开关面板不会重复触发。 */
      BUB.introPlayed = true;
      setBubbleMode('capsule');
      clearTimeout(BUB.timer);
      BUB.timer = setTimeout(function () {
        if (BUB.mode === 'capsule') setBubbleMode('circle');
      }, 450 + 4000);
    } else {
      setBubbleMode('circle');
    }
  }

  function hideBubble() {
    clearTimeout(BUB.timer);
    bubble.classList.remove('show');
    BUB.visible = false;
  }

  /* ---- 拖动 / 点击 ---- */
  bubble.addEventListener('pointerdown', function (e) {
    if (!BUB.visible) return;
    e.preventDefault();
    try { bubble.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events / 老浏览器 */ }
    BUB.drag = {
      x0: e.clientX, y0: e.clientY,
      l0: bubble.offsetLeft, t0: bubble.offsetTop,
      moved: false, t0ms: Date.now(),
      appW: appEl.offsetWidth, appH: appEl.offsetHeight,
    };
    bubble.classList.add('dragging');
    clearTimeout(BUB.timer);
    if (BUB.mode !== 'circle') setBubbleMode('circle'); /* 拖动时保持星标形态 */
  });

  bubble.addEventListener('pointermove', function (e) {
    var d = BUB.drag;
    if (!d) return;
    var dx = (e.clientX - d.x0) / FIT, dy = (e.clientY - d.y0) / FIT; /* 视觉像素 → 布局像素 */
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    var l = Math.min(Math.max(d.l0 + dx, BUB.EDGE), d.appW - BUB.SIZE - BUB.EDGE);
    var t = clampTop(d.t0 + dy, { h: d.appH });
    bubble.style.left = l + 'px';
    bubble.style.top = t + 'px';
  });

  function endDrag() {
    var d = BUB.drag;
    if (!d) return;
    BUB.drag = null;
    bubble.classList.remove('dragging');
    if (!d.moved && Date.now() - d.t0ms < 600) {
      openSheet(); /* 点击：打开半屏收藏层 */
      return;
    }
    /* 吸边：就近吸附左/右 */
    var l = parseFloat(bubble.style.left) || 0;
    BUB.side = (l + BUB.SIZE / 2 < d.appW / 2) ? 'left' : 'right';
    BUB.top = parseFloat(bubble.style.top);
    placeBubble();
  }
  bubble.addEventListener('pointerup', endDrag);
  bubble.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', function () {
    fitScale();
    if (BUB.visible) placeBubble();
    if (sheet.classList.contains('show')) sizeStack();
  });

  /* ============================================================
   * 收藏半屏浏览层（阶段3 正式版：叠卡/网格 + 半屏/全屏手势）
   * sheetState 在关闭后保留（浏览模式 + 卡片位置）
   * ============================================================ */

  var shield = $('eShield');
  var sheet = $('eSheet');
  var esGrab = $('esGrab');
  var esHead = $('esHead');
  var esBody = $('esBody');
  var esCount = $('esCount');
  var modeStackBtn = $('modeStack');
  var modeGridBtn = $('modeGrid');

  var sheetState = { mode: 'stack', index: 0, height: 'half' };

  function qualifiedCollections() {
    var sc = state.scenario && DATA.scenarios[state.scenario];
    if (!sc || !sc.recall || !sc.recall.qualified.length) return [];
    return sc.recall.qualified.map(function (id) { return DATA.collections[id]; });
  }

  /* ---- 叠卡 ---- */
  function stkCardEl(c, i) {
    var el = document.createElement('div');
    el.className = 'stk-card';
    el.dataset.i = i;
    el.innerHTML =
      '<div class="stk-img"><img src="' + c.cover + '" alt="" draggable="false"></div>' +
      '<div class="stk-title"></div>' +
      '<div class="stk-foot">' +
        avatarOf(c.author, 'stk-av') +
        '<span class="stk-author"></span>' +
        '<span class="stk-date">收藏于 ' + c.collectedDate + '</span>' +
      '</div>';
    el.querySelector('.stk-title').textContent = c.title;
    el.querySelector('.stk-author').textContent = c.author;
    return el;
  }

  /* ---- 叠卡尺寸推导（阶段修复：半屏/全屏自适应，杜绝图片无限拉伸） ----
   * 卡片宽 = min(按可用高度反推的宽度, 内容区宽度比例, 最大宽度)。
   * 图片 4:5，底部信息区实测约 94px，上下各留 12px 呼吸空间。 */
  function sizeStack() {
    if (sheetState.mode !== 'stack') return;
    var appH = appEl.offsetHeight;
    var finalSheetH = appH * (sheetState.height === 'full' ? 0.94 : 0.62);
    var chromeH = sheet.offsetHeight - esBody.offsetHeight; /* 抓手+头部等固定高度 */
    var availH = Math.max(140, finalSheetH - chromeH) - 26;  /* 减上下 padding 12+14 */
    var availW = esBody.clientWidth - 32;                    /* 减左右 padding 16×2 */
    var FOOTER = 94; /* 标题两行+作者行+内边距 实测估值 */
    var byH = (availH - FOOTER - 24) * 0.8;                  /* 高度约束反推宽（4:5 + 底部区 + 呼吸） */
    var byW = availW * (sheetState.height === 'full' ? 0.80 : 0.84); /* 宽度比例约束 */
    var w = Math.min(byH, byW, 330);
    if (w < 180) w = 180;
    esBody.style.setProperty('--stk-w', Math.round(w) + 'px');
  }

  function layoutStack() {
    esBody.querySelectorAll('.stk-card').forEach(function (el) {
      var off = (+el.dataset.i) - sheetState.index;
      var vis = off >= 0 && off <= 2;
      el.style.zIndex = String(100 - off);
      el.style.opacity = vis ? '1' : '0';
      el.style.transform =
        'translate(-50%, -50%) translateX(' + (off * 26) + 'px) translateY(' + (off * 4) + 'px) scale(' + (1 - off * 0.045).toFixed(3) + ')';
      el.style.pointerEvents = off === 0 ? 'auto' : 'none';
      el.style.filter = off > 0 ? 'brightness(' + (1 - off * 0.07).toFixed(2) + ')' : '';
    });
    updatePanelTint();
  }

  function buildStack() {
    var wrap = document.createElement('div');
    wrap.className = 'stk';
    var list = qualifiedCollections();
    list.forEach(function (c, i) { wrap.appendChild(stkCardEl(c, i)); });
    esBody.appendChild(wrap);
    layoutStack();

    var drag = null;
    wrap.addEventListener('pointerdown', function (e) {
      var top = wrap.querySelector('.stk-card[data-i="' + sheetState.index + '"]');
      if (!top) return;
      e.preventDefault();
      try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
      drag = { x0: e.clientX, y0: e.clientY, dx: 0, lock: null, top: top, t0: Date.now(), w: wrap.clientWidth, n: list.length };
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.x0) / FIT, dy = (e.clientY - drag.y0) / FIT; /* 视觉像素 → 布局像素 */
      if (!drag.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.lock = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        if (drag.lock === 'h') drag.top.classList.add('drag');
      }
      if (drag.lock !== 'h') return;
      var d = dx;
      /* 首卡右滑/末卡左滑：阻尼 */
      if ((sheetState.index === 0 && d > 0) || (sheetState.index === drag.n - 1 && d < 0)) d *= 0.3;
      drag.dx = d;
      drag.top.style.transform = 'translate(-50%, -50%) translateX(' + d + 'px) rotate(' + (d * 0.03).toFixed(2) + 'deg)';
    });
    function endSwipe() {
      if (!drag) return;
      var d = drag, dt = Date.now() - d.t0;
      drag = null;
      if (d.lock === 'h') {
        d.top.classList.remove('drag');
        var w = d.w;
        var fling = dt < 260 && Math.abs(d.dx) > 24;
        var nextOk = d.dx < 0 && sheetState.index < d.n - 1;
        var prevOk = d.dx > 0 && sheetState.index > 0;
        if ((nextOk || prevOk) && (Math.abs(d.dx) > w * 0.3 || fling)) {
          var dir = nextOk ? -1 : 1;
          d.top.style.transition = 'transform .26s ease-in, opacity .26s ease';
          d.top.style.transform = 'translate(-50%, -50%) translateX(' + (dir * w * 1.25) + 'px) rotate(' + (dir * 8) + 'deg)';
          d.top.style.opacity = '0';
          setTimeout(function () {
            sheetState.index += nextOk ? 1 : -1;
            d.top.style.transition = '';
            d.top.style.opacity = '';
            layoutStack();
          }, 240);
        } else {
          layoutStack(); /* 弹回 */
        }
      } else if (!d.lock && dt < 400) {
        /* 点击当前卡片 → 进入原帖详情 */
        d.top.style.transition = 'transform .12s ease';
        d.top.style.transform = 'translate(-50%, -50%) scale(.97)';
        setTimeout(function () { layoutStack(); }, 140);
        openDetail(collectionToDetail(list[sheetState.index]));
      }
    }
    wrap.addEventListener('pointerup', endSwipe);
    wrap.addEventListener('pointercancel', function () {
      if (drag) { var d = drag; drag = null; d.top.classList.remove('drag'); layoutStack(); }
    });
  }

  /* ---- 面板背景跟随卡片主色（磨砂玻璃染色） ----
   * 顶卡封面取主色（canvas 24×24 采样均值 + 轻度增饱和），
   * 与深色底 (20,20,24) 混合 28% 作为面板背景色，透明度保持 .5；
   * 网格模式取全部封面均值。仅深色模式生效。 */
  var tintCache = {};
  var tintTarget = null;
  function domColorOf(src, cb) {
    if (tintCache[src] !== undefined) { cb(tintCache[src]); return; }
    var img = new Image();
    img.onload = function () {
      var col = null;
      try {
        var c = document.createElement('canvas'); c.width = 24; c.height = 24;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 24, 24);
        var d = x.getImageData(0, 0, 24, 24).data;
        var r = 0, g = 0, b = 0, n = d.length / 4;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (mx > mn) { /* 增饱和 1.3，避免均值发灰 */
          r = Math.max(0, Math.min(255, Math.round(l + (r - l) * 1.3)));
          g = Math.max(0, Math.min(255, Math.round(l + (g - l) * 1.3)));
          b = Math.max(0, Math.min(255, Math.round(l + (b - l) * 1.3)));
        }
        col = [r, g, b];
      } catch (e) { col = null; }
      tintCache[src] = col;
      cb(col);
    };
    img.onerror = function () { tintCache[src] = null; cb(null); };
    img.src = src;
  }
  function applyPanelTint(srcs) {
    tintTarget = srcs.join('|');
    var target = tintTarget, cols = [], done = 0;
    srcs.forEach(function (s, i) {
      domColorOf(s, function (col) {
        if (tintTarget !== target) return;
        cols[i] = col;
        done++;
        if (done < srcs.length) return;
        var ok = cols.filter(Boolean);
        if (!ok.length) { sheet.style.backgroundColor = ''; return; }
        var r = 0, g = 0, b = 0;
        ok.forEach(function (c) { r += c[0]; g += c[1]; b += c[2]; });
        r = Math.round(r / ok.length); g = Math.round(g / ok.length); b = Math.round(b / ok.length);
        var T = 0.28, B = [20, 20, 24];
        sheet.style.backgroundColor = 'rgba(' +
          Math.round(B[0] + (r - B[0]) * T) + ',' +
          Math.round(B[1] + (g - B[1]) * T) + ',' +
          Math.round(B[2] + (b - B[2]) * T) + ',.5)';
      });
    });
  }
  function updatePanelTint() {
    if (!document.querySelector('.screen.dark')) { sheet.style.backgroundColor = ''; return; }
    var list = qualifiedCollections();
    if (!list.length) { sheet.style.backgroundColor = ''; return; }
    if (sheetState.mode === 'stack') {
      applyPanelTint([list[Math.min(sheetState.index, list.length - 1)].cover]);
    } else {
      applyPanelTint(list.map(function (c) { return c.cover; }));
    }
  }

  /* ---- 网格 ---- */
  function buildGrid() {
    var grid = document.createElement('div');
    grid.className = 'es-grid';
    qualifiedCollections().forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'es-card';
      card.innerHTML =
        '<div class="im"><img src="' + c.cover + '" alt=""></div>' +
        '<div class="t"></div>' +
        '<div class="a">' + avatarOf(c.author, 'es-av') + '<span class="an"></span></div>';
      card.querySelector('.t').textContent = c.title;
      card.querySelector('.an').textContent = c.author;
      card.addEventListener('click', function () {
        openDetail(collectionToDetail(c));
      });
      grid.appendChild(card);
    });
    esBody.appendChild(grid);
  }

  /* ---- 渲染 / 开关 / 模式 ---- */
  function renderSheetBody() {
    esBody.innerHTML = '';
    esBody.className = 'es-body ' + (sheetState.mode === 'stack' ? 'es-body-stk' : 'es-body-grid');
    if (sheetState.mode === 'stack') { buildStack(); sizeStack(); }
    else { buildGrid(); updatePanelTint(); }
    modeStackBtn.classList.toggle('on', sheetState.mode === 'stack');
    modeGridBtn.classList.toggle('on', sheetState.mode === 'grid');
  }

  function openSheet() {
    if (esCount) esCount.textContent = qualifiedCollections().length;
    renderSheetBody();
    sheet.classList.toggle('full', sheetState.height === 'full');
    sizeStack();
    shield.classList.add('show');
    sheet.classList.add('show');
  }

  function closeSheet() {
    shield.classList.remove('show');
    sheet.classList.remove('show');
    sheet.classList.remove('dragging2');
    sheet.style.height = '';
    sheetState.height = 'half'; /* 重新打开默认半屏；模式与卡片位置保留 */
    hdrag = null;
  }

  modeStackBtn.addEventListener('click', function () {
    if (sheetState.mode !== 'stack') { sheetState.mode = 'stack'; renderSheetBody(); }
  });
  modeGridBtn.addEventListener('click', function () {
    if (sheetState.mode !== 'grid') { sheetState.mode = 'grid'; renderSheetBody(); }
  });

  /* ---- 用户控制（阶段5）：本次隐藏 ----
   * 语义：隐藏当前搜索主题下的召回入口；同主题连续搜索不反复出现；
   * 换主题（s2/s3/空态）后重新判断。会话级，刷新即重置。 */
  var ctrl = { hiddenScenario: null };

  function hideForThisTopic() {
    if (state.scenario) ctrl.hiddenScenario = state.scenario;
    closeSheet();
    hideBubble();
  }
  $('esHide').addEventListener('click', hideForThisTopic);

  shield.addEventListener('click', closeSheet);

  /* ---- 半屏 ↔ 全屏 / 下拉关闭（header 垂直拖动） ---- */
  var hdrag = null;
  [esGrab, esHead].forEach(function (h) {
    h.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.es-mode, .es-hide')) return; /* 模式/隐藏按钮不触发拖层 */
      e.preventDefault();
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      var ah = appEl.offsetHeight;
      hdrag = { y0: e.clientY, h0: sheet.offsetHeight, from: sheetState.height, minH: ah * 0.5, maxH: ah * 0.94, dy: 0 };
      sheet.classList.add('dragging2');
    });
    h.addEventListener('pointermove', function (e) {
      if (!hdrag) return;
      var dy = (e.clientY - hdrag.y0) / FIT; /* 视觉像素 → 布局像素 */
      hdrag.dy = dy;
      sheet.style.height = Math.min(Math.max(hdrag.h0 - dy, hdrag.minH), hdrag.maxH) + 'px';
    });
    function end() {
      if (!hdrag) return;
      var d = hdrag; hdrag = null;
      sheet.classList.remove('dragging2');
      sheet.style.height = '';
      var dy = d.dy || 0;
      if (d.from === 'half') {
        if (dy < -56) sheetState.height = 'full';
        else if (dy > 70) { closeSheet(); return; }
        else sheetState.height = 'half';
      } else {
        sheetState.height = dy > 56 ? 'half' : 'full';
      }
      sheet.classList.toggle('full', sheetState.height === 'full');
      sizeStack(); /* 高度档位变化后重新推导卡片尺寸（带过渡） */
      setTimeout(sizeStack, 340); /* 高度过渡结束后复核一次，防止读到中间值 */
    }
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  });

  /* ============================================================
   * 笔记详情页（阶段4）：原帖阅读 + 状态保持
   * 详情页覆盖在最上层（z55），底层 sheet/瀑布流/滚动位置全部不动，
   * 返回即原样恢复，无需任何快照逻辑。
   * ============================================================ */

  var pageDetail = $('pageDetail');
  var dtScroll = $('dtScroll');
  var dtTrack = $('dtTrack');
  var dtDots = $('dtDots');
  var dtCarEl = $('dtCarousel');

  function fmtLikes(n) {
    if (n >= 10000) {
      var w = (n / 10000).toFixed(1);
      if (w.indexOf('.0') > -1) w = w.slice(0, -2);
      return w + '万';
    }
    return String(n);
  }

  function collectionToDetail(c) {
    return {
      title: c.title, author: c.author,
      likes: fmtLikes(c.likes), starN: fmtLikes(c.collects), cmtN: String(c.comments),
      images: [c.cover].concat(c.images || []),
      date: c.date, body: c.body, commentsData: c.commentsData,
      collected: true,
    };
  }

  function noteDetailOf(item) {
    var extra = (DATA.detailExtra || {})[item.cover] || {};
    return {
      title: item.title, author: item.author,
      likes: item.likes, starN: extra.collects || '收藏',
      cmtN: String((extra.commentsData || []).length),
      images: [item.cover],
      date: extra.date || '2026-06-01', body: extra.body || [],
      commentsData: extra.commentsData || [],
      collected: false,
    };
  }

  var car = { n: 1, idx: 0, w: 0, drag: null };

  function carGo(i, animate) {
    car.idx = Math.min(Math.max(i, 0), Math.max(car.n - 1, 0));
    if (animate) dtTrack.style.transition = 'transform .26s cubic-bezier(.32,.72,.35,1)';
    else dtTrack.style.transition = 'none';
    dtTrack.style.transform = 'translateX(' + (-car.idx * car.w) + 'px)';
    if (animate) setTimeout(function () { dtTrack.style.transition = 'none'; }, 280);
    dtDots.querySelectorAll('.dt-dot').forEach(function (d, di) {
      d.classList.toggle('on', di === car.idx);
    });
  }

  dtCarEl.addEventListener('pointerdown', function (e) {
    if (car.n < 2) return;
    e.preventDefault();
    try { dtCarEl.setPointerCapture(e.pointerId); } catch (err) {}
    car.drag = { x0: e.clientX, t0: Date.now() };
    dtTrack.style.transition = 'none';
  });
  dtCarEl.addEventListener('pointermove', function (e) {
    if (!car.drag) return;
    var dx = (e.clientX - car.drag.x0) / FIT; /* 视觉像素 → 布局像素 */
    dtTrack.style.transform = 'translateX(' + (-car.idx * car.w + dx) + 'px)';
  });
  function carEnd(e) {
    if (!car.drag) return;
    var dx = (e.clientX - car.drag.x0) / FIT, dt = Date.now() - car.drag.t0;
    car.drag = null;
    if (Math.abs(dx) > car.w * 0.16 || (dt < 260 && Math.abs(dx) > 30)) carGo(car.idx + (dx < 0 ? 1 : -1), true);
    else carGo(car.idx, true);
  }
  dtCarEl.addEventListener('pointerup', carEnd);
  dtCarEl.addEventListener('pointercancel', carEnd);

  var dtLikeBtn = $('dtLike'), dtStarBtn = $('dtStar'), dtFollowBtn = $('dtFollow');

  function openDetail(d) {
    /* 轮播 */
    dtTrack.innerHTML = '';
    dtDots.innerHTML = '';
    d.images.forEach(function (src) {
      var s = document.createElement('div');
      s.className = 'dt-slide';
      var im = document.createElement('img');
      im.src = src; im.draggable = false;
      s.appendChild(im);
      dtTrack.appendChild(s);
    });
    car.n = d.images.length; car.idx = 0;
    car.w = dtCarEl.clientWidth;
    if (car.n > 1) {
      d.images.forEach(function (_, i) {
        var dot = document.createElement('span');
        dot.className = 'dt-dot' + (i === 0 ? ' on' : '');
        dtDots.appendChild(dot);
      });
    }
    carGo(0, false);

    /* 正文 */
    $('dtTitle').textContent = d.title;
    var bodyEl = $('dtBody');
    bodyEl.innerHTML = '';
    d.body.forEach(function (p) {
      var el = document.createElement('p');
      el.textContent = p;
      bodyEl.appendChild(el);
    });
    $('dtDate').textContent = '发布于 ' + d.date;

    /* 评论 */
    $('dtChHead').textContent = '共 ' + d.commentsData.length + ' 条评论';
    var cmEl = $('dtComments');
    cmEl.innerHTML = '';
    d.commentsData.forEach(function (cm) {
      var row = document.createElement('div');
      row.className = 'dt-cm';
      row.innerHTML =
        avatarOf(cm.user, 'av') +
        '<div class="m"><div class="n"></div><div class="t"></div><div class="f"></div></div>';
      row.querySelector('.n').textContent = cm.user;
      row.querySelector('.t').textContent = cm.text;
      row.querySelector('.f').textContent = d.date + ' · 赞 ' + cm.likes;
      cmEl.appendChild(row);
    });

    /* 顶部作者行（头像：图片映射优先，否则文字圆点） */
    var av = $('dtAv');
    var avSrc = (DATA.avatars || {})[d.author];
    if (avSrc) {
      av.setAttribute('style', '');
      av.textContent = '';
      av.style.background = 'url("' + avSrc + '") center / cover no-repeat';
      av.classList.add('av-photo');
    } else {
      av.setAttribute('style', avatarStyle(d.author));
      av.textContent = d.author.charAt(0);
      av.classList.remove('av-photo');
    }
    $('dtName').textContent = d.author;
    $('dtCmtN').textContent = d.cmtN;
    $('dtLikeN').textContent = d.likes;
    $('dtStarN').textContent = d.starN;
    dtLikeBtn.classList.remove('on');
    dtStarBtn.classList.toggle('on', !!d.collected);
    dtFollowBtn.classList.remove('on');
    dtFollowBtn.textContent = '关注';

    dtScroll.scrollTop = 0;
    pageDetail.classList.add('in');
  }

  function closeDetail() {
    pageDetail.classList.remove('in');
  }

  $('dtBack').addEventListener('click', closeDetail);

  /* 计数解析/回写：兼容「1234」与「1.2万」两种格式；非数字文本不动 */
  function parseN(s) {
    s = String(s || '').trim();
    var m = s.match(/^([\d.]+)(万)?$/);
    if (!m) return null;
    var v = parseFloat(m[1]);
    return m[2] ? Math.round(v * 10000) : v;
  }
  function fmtN(n) {
    if (n >= 10000) {
      var w = (n / 10000).toFixed(1);
      if (w.indexOf('.0') > -1) w = w.slice(0, -2);
      return w + '万';
    }
    return String(n);
  }
  function bumpCount(id, on) {
    var b = $(id);
    var n = parseN(b.textContent);
    if (n === null) return;
    b.textContent = fmtN(Math.max(0, n + (on ? 1 : -1)));
  }
  dtLikeBtn.addEventListener('click', function () {
    var on = dtLikeBtn.classList.toggle('on');
    bumpCount('dtLikeN', on);
  });
  dtStarBtn.addEventListener('click', function () {
    var on = dtStarBtn.classList.toggle('on');
    bumpCount('dtStarN', on);
  });
  dtFollowBtn.addEventListener('click', function () {
    var on = dtFollowBtn.classList.toggle('on');
    dtFollowBtn.textContent = on ? '已关注' : '关注';
  });

  /* 评论定位：输入框 / 评论图标 → 平滑滚到评论区 */
  function gotoComments() {
    var st = $('dtScroll'), cm = $('dtComments');
    var top = cm.getBoundingClientRect().top - st.getBoundingClientRect().top + st.scrollTop - 10;
    st.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
  $('dtSay').addEventListener('click', gotoComments);
  $('dtCmt').addEventListener('click', gotoComments);

  /* ============================================================
   * 搜索流程（阶段1 + Bubble 集成）
   * ============================================================ */

  function doSearch(q) {
    q = (q || '').trim();
    if (!q) { input.focus(); return; }
    /* 换搜索词 → 胶囊重新播放（同一词重复搜索不重播，避免闪烁） */
    if (q !== state.query) BUB.introPlayed = false;
    state.query = q;
    state.scenario = DATA.routeQuery(q);
    input.value = q;
    renderResults();
    wfWrap.scrollTop = 0;
    pageResults.classList.add('in');

    hideBubble();
    closeSheet();
    closeDetail();

    /* 本次隐藏：同主题连续搜索 → 不召回；换主题 → 清除隐藏并重新判断 */
    if (ctrl.hiddenScenario && state.scenario !== ctrl.hiddenScenario) {
      ctrl.hiddenScenario = null;
      BUB.introPlayed = false; /* 重新出现时再次以胶囊展示召回数量 */
    }

    var hasRecall = state.scenario &&
      DATA.scenarios[state.scenario].recall.qualified.length > 0 &&
      ctrl.hiddenScenario !== state.scenario;
    if (hasRecall) {
      /* 合格收藏存在 → 稍作停顿后出现 Echo Bubble（模拟匹配过程） */
      setTimeout(function () {
        var stillHas = state.scenario &&
          DATA.scenarios[state.scenario].recall.qualified.length > 0 &&
          ctrl.hiddenScenario !== state.scenario;
        if (stillHas) showBubble();
      }, 750);
    }
    /* 无合格收藏（s2 / 空态 / 已隐藏）：不渲染 Bubble */
    pushHistory(q);
  }

  function backToSearch(focusInput) {
    hideBubble();
    closeSheet();
    closeDetail();
    pageResults.classList.remove('in');
    if (focusInput) { input.focus(); input.select(); }
  }

  /* ---------- 搜索历史 ---------- */
  function pushHistory(q) {
    var i = historyList.indexOf(q);
    if (i > -1) historyList.splice(i, 1);
    historyList.unshift(q);
    if (historyList.length > 8) historyList.length = 8;
    renderHistory();
  }
  function renderHistory() {
    histChips.innerHTML = '';
    historyList.forEach(function (t) {
      var s = document.createElement('span');
      s.className = 'chip';
      s.textContent = t;
      histChips.appendChild(s);
    });
  }
  renderHistory();

  /* ---------- 事件绑定 ---------- */
  $('btnSearch').addEventListener('click', function () { doSearch(input.value); });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch(input.value);
      input.blur();
    }
  });

  /* 搜索中间页 ✕ 清除 */
  $('searchClear').addEventListener('click', function (e) {
    e.stopPropagation();
    input.value = '';
    input.focus();
  });

  $('resBack').addEventListener('click', function () { backToSearch(false); });
  $('resBar').addEventListener('click', function (e) {
    if (e.target.closest('.resclear')) return; /* ✕ 走自己的逻辑 */
    if (e.target.closest('.resgo')) return;    /* 搜索按钮走自己的逻辑 */
    backToSearch(true);
  });
  /* ✕ 清除关键词：回到搜索页并清空输入框（真机行为） */
  $('resClear').addEventListener('click', function () {
    backToSearch(true);
    var inp = $('searchInput');
    if (inp) { inp.value = ''; inp.focus(); }
  });
  /* 「搜索」按钮：按当前关键词重新执行 */
  $('resGo').addEventListener('click', function () {
    var q = $('resQuery').textContent;
    if (q) doSearch(q);
  });

  document.addEventListener('click', function (e) {
    var chip = e.target.closest ? e.target.closest('.chip') : null;
    if (chip) doSearch(chip.textContent.trim());
  });

  /* ---------- QA / 控制台入口（非 UI 调试按钮） ---------- */
  window.doSearch = doSearch;
  window.__recho = {
    openSheet: openSheet,
    closeSheet: closeSheet,
    showBubble: showBubble,
    hideBubble: hideBubble,
    openDetail: openDetail,
    closeDetail: closeDetail,
    BUB: BUB,
    sheetState: sheetState,
    ctrl: ctrl,
  };

  /* ---------- 数据层自检 ---------- */
  if (typeof DATA !== 'undefined') {
    console.log('[Red Echo] 数据层就绪 ·',
      '路由自检:',
      '云南雨季自由行→', DATA.routeQuery('云南雨季自由行'),
      '| 云南最新班车时刻→', DATA.routeQuery('云南最新班车时刻'),
      '| 室内绿植养护→', DATA.routeQuery('室内绿植养护'),
      '| 未知词→', DATA.routeQuery('随便打点字'));
  }

  /* ---------- 初始状态（启动逻辑，位于所有事件监听注册之后） ----------
   * 首次打开直接进入默认搜索结果页：瀑布流 + 自动出现 Echo Bubble（胶囊→收缩为星标+角标）。
   * 用户点击顶部搜索框仍可返回搜索中间页修改关键词。
   * 默认主场景已切换为「摄影审美」（2026-09，摄影演示主场景）。 */
  fitScale();
  doSearch('摄影审美');
})();
