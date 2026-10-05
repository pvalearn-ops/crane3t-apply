/* 照片頁：即時自動儲存／還原（標註值、端點、伸臂分節存 localStorage；照片存 IndexedDB）
 * 依附於 index.html 主程式之全域 state / renderCanvas / renderBoomTable 等函式。 */
(function () {
  const KEY = 'crane_photo_annotations';
  const caseMode = !!window.CASE_ID && !!window.CaseFiles;
  let dirty = false, initPhase = true, timer = null;
  const lastSaved = { 1: null, 2: null, 3: null };
  const deferredSamples = [];

  const $ = (id) => document.getElementById(id);
  function payload() {
    return {
      front: { width: $('val-front-outrigger')?.value, status: $('val-front-status')?.value, note: $('val-front-note')?.value, markers: state.markers[1] },
      side: { frontToCenter: $('val-side-front-to-center')?.value, wheelbase: $('val-side-wheelbase')?.value, note: $('val-side-note')?.value, markers: state.markers[2] },
      boom: { sections: state.boomSections, retracted: $('val-boom-retracted')?.value, note: $('val-boom-note')?.value, markers: state.markers[3] },
      savedAt: new Date().toISOString()
    };
  }
  function downscale(img) {
    const max = 2000, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  }
  function saveNow() {
    clearTimeout(timer); timer = null;
    if (!dirty || initPhase) return;
    try { localStorage.setItem(KEY, JSON.stringify(payload())); } catch (e) {}
    if (caseMode) [1, 2, 3].forEach(step => {
      const img = state.images[step];
      if (img && img.src && img.src.startsWith('data:') && img.src !== lastSaved[step]) {
        lastSaved[step] = img.src;
        try { window.CaseFiles.put('photo' + step, '照片' + step + '.jpg', 'image/jpeg', downscale(img)); } catch (e) {}
      }
    });
  }
  const schedule = () => { if (initPhase) return; clearTimeout(timer); timer = setTimeout(saveNow, 600); };
  const markDirty = () => { if (!initPhase) { dirty = true; schedule(); } };

  // 上傳 PDF 時，以第 1 頁轉成圖片再交給原本的上傳流程
  const origUpload = window.handleFileUpload;
  window.handleFileUpload = async function (step, event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) && window.PdfTools) {
      try {
        if (typeof showToast === 'function') showToast('PDF 轉換中…');
        const { dataUrl, pages } = await window.PdfTools.pageToDataUrl(file, 1);
        const img = new Image();
        img.onload = () => { state.images[step] = img; stopCamera(step); origRender(step); markDirty(); if (typeof showToast === 'function') showToast(pages > 1 ? `已載入 PDF 第 1 頁（共 ${pages} 頁）` : '已載入 PDF'); };
        img.src = dataUrl;
      } catch (e) { alert('PDF 讀取失敗：' + e.message); }
      event.target.value = '';
      return;
    }
    const r = origUpload.apply(this, arguments); markDirty(); return r;
  };

  // 包裝原函式：任何重繪即排程存檔；結構變更視為使用者編輯
  const origRender = window.renderCanvas;
  window.renderCanvas = function () { const r = origRender.apply(this, arguments); schedule(); return r; };
  ['addBoomSection', 'removeBoomSection', 'deleteBoomSection', 'handleBoomLengthChange', 'resetMarkers', 'capturePhoto'].forEach(fn => {
    const o = window[fn]; if (typeof o === 'function') window[fn] = function () { const r = o.apply(this, arguments); markDirty(); return r; };
  });
  // 申請案模式：初始化期間的範例照片載入延後，若該案已有照片則不載入範例
  const origSample = window.loadSamplePhoto;
  window.loadSamplePhoto = function (step, notify) {
    if (caseMode && initPhase) { deferredSamples.push(step); return; }
    return origSample.apply(this, arguments);
  };
  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  document.addEventListener('pointerdown', (e) => { if (e.target && e.target.tagName === 'CANVAS') markDirty(); }, true);
  document.addEventListener('touchstart', (e) => { if (e.target && e.target.tagName === 'CANVAS') markDirty(); }, true);
  window.addEventListener('pointerup', schedule);
  window.addEventListener('beforeunload', () => { if (timer) saveNow(); });

  async function restore() {
    let d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (d) {
      const set = (id, v) => { const el = $(id); if (el && v != null) el.value = v; };
      if (d.front) { set('val-front-outrigger', d.front.width); set('val-front-status', d.front.status); set('val-front-note', d.front.note); if (d.front.markers) state.markers[1] = d.front.markers; }
      if (d.side) { set('val-side-front-to-center', d.side.frontToCenter); set('val-side-wheelbase', d.side.wheelbase); set('val-side-note', d.side.note); if (d.side.markers) state.markers[2] = d.side.markers; }
      if (d.boom) { if (Array.isArray(d.boom.sections) && d.boom.sections.length) state.boomSections = d.boom.sections; set('val-boom-retracted', d.boom.retracted); set('val-boom-note', d.boom.note); if (d.boom.markers) state.markers[3] = d.boom.markers; }
      dirty = true;
    } else if (caseMode) {
      // 新申請案：清除範例數值，避免誤當實測值
      ['val-front-outrigger', 'val-side-front-to-center', 'val-side-wheelbase', 'val-boom-retracted'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      state.boomSections.forEach(sec => { sec.length = 0; });
    }
    if (typeof renderBoomTable === 'function') renderBoomTable();
    if (caseMode) {
      for (const step of [1, 2, 3]) {
        const rec = await window.CaseFiles.get('photo' + step).catch(() => null);
        if (rec && rec.dataUrl) {
          await new Promise(res => { const img = new Image(); img.onload = () => { state.images[step] = img; lastSaved[step] = img.src; res(); }; img.onerror = res; img.src = rec.dataUrl; });
        } else if (deferredSamples.includes(step)) {
          origSample(step, false); // 無照片時仍顯示範例作為拍攝參考
        }
      }
    }
    [1, 2, 3].forEach(s => { try { origRender(s); } catch (e) {} });
    initPhase = false;
    // 由主控台 S5 開啟時，直接切到指定照片的標註步驟
    const qs = new URLSearchParams(location.search), st = +qs.get('step');
    // 嵌入主控台視窗時隱藏頁首（含「載入範例圖」，避免覆蓋已上傳照片）
    if (qs.get('embed')) document.querySelectorAll('header').forEach(h => { h.style.display = 'none'; });
    if (st >= 1 && st <= 4 && typeof showStep === 'function') { try { showStep(st); } catch (e) {} }
  }
  window.addEventListener('DOMContentLoaded', () => { setTimeout(restore, 0); });
})();
