/**
 * 產出完整申請資料 PDF
 * 依「文件需求一覽」順序，將各文件頁面（以列印樣式擷取成 A4 影像）與上傳之附件
 * （圖片、PDF 原頁）串接成單一 PDF，並自動產生封面與目錄頁次。
 */
const PdfExport = (() => {
  const LIB = {
    h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
  };
  const A4 = [595.28, 841.89], M = 24; // pt
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function loadScript(url, win = window, test) {
    if (test && test(win)) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = win.document.createElement('script'); s.src = url;
      s.onload = res; s.onerror = () => rej(new Error('無法載入元件：' + url));
      win.document.head.appendChild(s);
    });
  }
  const dataUrlBytes = (u) => { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

  /* 將 @media print 規則套用為一般樣式（模擬列印外觀） */
  function emulatePrint(doc, extra = '') {
    let css = '';
    for (const sh of Array.from(doc.styleSheets)) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const r of Array.from(rules || [])) {
        if (r.type === CSSRule.MEDIA_RULE && /print/.test(r.media.mediaText)) for (const rr of Array.from(r.cssRules)) css += rr.cssText + '\n';
      }
    }
    const st = doc.createElement('style');
    st.textContent = css + '\n.no-print{display:none !important;}\n' + extra;
    doc.head.appendChild(st);
  }

  /* 文字轉圖（PDF 內中文說明用，避免嵌入中文字型） */
  function textCanvas(lines, opt = {}) {
    const W = opt.width || 1600, fs = opt.size || 34, lh = Math.round(fs * 1.5);
    const cv = document.createElement('canvas'); const ctx = cv.getContext('2d');
    ctx.font = `${opt.bold ? '700 ' : ''}${fs}px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif`;
    const wrapped = [];
    for (const ln of [].concat(lines)) {
      let cur = '';
      for (const ch of String(ln)) { if (ctx.measureText(cur + ch).width > W - 20) { wrapped.push(cur); cur = ch; } else cur += ch; }
      wrapped.push(cur);
    }
    cv.width = W; cv.height = Math.max(lh, wrapped.length * lh + 10);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = opt.color || '#0f172a';
    ctx.font = `${opt.bold ? '700 ' : ''}${fs}px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif`;
    ctx.textBaseline = 'top';
    wrapped.forEach((t, i) => ctx.fillText(t, 10, i * lh + 5));
    return cv;
  }

  /* ---------- 可換頁位置：區塊頂端（不在公式框、圖片、表格列等不可分割區塊內部） ---------- */
  const ATOMIC = 'tr, .formula, .imgslot, figure, .resultline, .kpi, .note, .callout, .a1method, img, canvas, h1, h2, h3, h4';
  const BLOCKS = 'tr, h1, h2, h3, h4, p, li, table, .formula, .imgslot, figure, .resultline, .kpi, .note, .callout, .a1method, .tbl-scroll, .doc-header, .footer-row, .desc-p';
  function safeBreaks(el) {
    const base = el.getBoundingClientRect().top, out = new Set();
    el.querySelectorAll(BLOCKS).forEach(n => {
      const par = n.parentElement && n.parentElement.closest(ATOMIC);
      if (par && el.contains(par)) return;               // 位於不可分割區塊內部
      const t = n.getBoundingClientRect().top - base;
      if (t > 4) out.add(Math.round(t));
    });
    return Array.from(out);
  }

  /* ---------- 擷取前的版面整理 ---------- */
  // 輸入框 → 純文字（避免 html2canvas 裁切數字、留下外框）
  function flattenForms(doc, root) {
    const win = doc.defaultView;
    root.querySelectorAll('input, textarea, select').forEach(el => {
      const t = (el.type || '').toLowerCase();
      if (['checkbox', 'radio', 'file', 'hidden', 'button', 'submit'].includes(t) || el.offsetParent === null) return;
      const cs = win.getComputedStyle(el);
      const isArea = el.tagName === 'TEXTAREA';
      const text = el.tagName === 'SELECT' ? (el.selectedOptions[0] && el.value ? el.selectedOptions[0].text : '') : el.value;
      const span = doc.createElement(isArea ? 'div' : 'span');
      span.textContent = text;
      span.style.cssText = `display:${isArea ? 'block' : 'inline-flex'};align-items:center;justify-content:${cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' ? 'flex-end' : 'flex-start'};` +
        `box-sizing:border-box;width:${el.offsetWidth}px;min-height:${isArea ? el.offsetHeight : Math.max(el.offsetHeight, 10)}px;` +
        `font:${cs.fontWeight} ${cs.fontSize}/1.25 ${cs.fontFamily};color:${cs.color === 'rgba(0, 0, 0, 0)' ? '#000' : cs.color};text-align:${cs.textAlign};` +
        `padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft};white-space:${isArea ? 'pre-wrap' : 'normal'};word-break:break-all;` +
        `vertical-align:middle;flex:${cs.flex};margin:${cs.margin};letter-spacing:${cs.letterSpacing};`;
      el.replaceWith(span);
    });
    // contenteditable / pre-line 的換行改為明確 <br>
    root.querySelectorAll('.load-cell-content').forEach(el => {
      const cs = win.getComputedStyle(el);
      const lines = (el.innerText || '').split('\n').filter(x => x !== '');
      const inner = doc.createElement('div');
      inner.style.cssText = `width:100%;text-align:center;font:${cs.fontWeight} ${cs.fontSize}/1.25 ${cs.fontFamily};color:${cs.color};`;
      inner.innerHTML = lines.map(x => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))).join('<br>');
      el.innerHTML = ''; el.appendChild(inner);
    });
  }
  // 斜線格／左上角斜線表頭：以等尺寸 SVG 背景取代 CSS 漸層（html2canvas 無法正確繪製 calc() 漸層）
  function drawSlashes(doc, root) {
    const svg = (w, h, lw) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w * 3}' height='${h * 3}' viewBox='0 0 ${w} ${h}'><line x1='0' y1='0' x2='${w}' y2='${h}' stroke='black' stroke-width='${lw}'/></svg>`)}")`;
    // 左上角表頭：改為上下兩列文字（右上「吊桿長度」、左下「作業半徑」），避免絕對定位在擷取時錯位
    root.querySelectorAll('.diagonal-split').forEach(el => {
      const top = (el.querySelector('.top-text') || {}).textContent || '', bot = (el.querySelector('.bottom-text') || {}).textContent || '';
      const cell = el.closest('th, td') || el;
      el.outerHTML = `<div style="display:flex;flex-direction:column;justify-content:space-between;height:${cell.clientHeight}px;padding:5px 8px;box-sizing:border-box;font-weight:700;font-size:17px;">` +
        `<div style="text-align:right">${top}</div><div style="text-align:left">${bot}</div></div>`;
    });
    root.querySelectorAll('.diagonal-slash-cell, .corner-header-cell').forEach(el => {
      const w = Math.max(1, el.offsetWidth), h = Math.max(1, el.offsetHeight);
      el.style.setProperty('background', `${svg(w, h, 1.4)} 0 0 / 100% 100% no-repeat #fff`, 'important');
    });
  }
  // 依 A4 比例拉高表格列，使表單滿版
  function fillA4(root, landscape) {
    const ratio = landscape ? (A4[0] - 2 * M) / (A4[1] - 2 * M) : (A4[1] - 2 * M) / (A4[0] - 2 * M);
    for (let k = 0; k < 3; k++) {
      const W = root.offsetWidth, H = root.offsetHeight, target = W * ratio - 4;
      if (H >= target - 2) break;
      const rows = Array.from(root.querySelectorAll('tr')).filter(r => r.offsetHeight > 0);
      if (!rows.length) break;
      const add = (target - H) / rows.length;
      rows.forEach(r => { const h = r.offsetHeight + add; r.style.height = h + 'px'; Array.from(r.cells).forEach(td => td.style.height = h + 'px'); });
    }
  }

  class Builder {
    constructor(log) { this.log = log; this.toc = []; this.cur = null; }
    async init() {
      await loadScript(LIB.pdflib, window, w => w.PDFLib);
      await loadScript(LIB.h2c, window, w => w.html2canvas);
      this.doc = await PDFLib.PDFDocument.create();
      this.font = await this.doc.embedFont(PDFLib.StandardFonts.Helvetica);
    }
    section(no, title) { this.cur = { no, title, start: this.doc.getPageCount() + 1, count: 0, items: [], missing: [] }; this.toc.push(this.cur); }
    note(label, ok = true) { if (this.cur) (ok ? this.cur.items : this.cur.missing).push(label); }
    /* 隔頁：整頁置中顯示項次與標題 */
    async divider(no, title, sub) {
      const W = 1240, H = 1754, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d'); const font = (w, s) => `${w} ${s}px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif`;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1e3a8a'; ctx.font = font(700, 54); ctx.fillText(String(no), W / 2, H * 0.40);
      ctx.fillStyle = '#0f172a'; let fs = 64; ctx.font = font(700, fs);
      while (ctx.measureText(title).width > W - 160 && fs > 30) { fs -= 2; ctx.font = font(700, fs); }
      ctx.fillText(title, W / 2, H * 0.47);
      ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W * 0.25, H * 0.52); ctx.lineTo(W * 0.75, H * 0.52); ctx.stroke();
      if (sub) { ctx.fillStyle = '#475569'; ctx.font = font(400, 30); ctx.fillText(sub, W / 2, H * 0.56); }
      const page = this.newPage(false);
      page.drawImage(await this.embedCanvas(cv), { x: 0, y: 0, width: A4[0], height: A4[1] });
    }
    newPage(land) { const p = this.doc.addPage(land ? [A4[1], A4[0]] : A4); if (this.cur) this.cur.count++; return p; }

    async embedCanvas(cv) { return this.doc.embedJpg(dataUrlBytes(cv.toDataURL('image/jpeg', 0.88))); }

    /* 將一張畫布放入 A4（必要時依高度分頁），caption 置頂 */
    async addCanvas(cv, opt = {}) {
      if (!cv || !cv.width || !cv.height) return;
      const land = opt.landscape != null ? opt.landscape : cv.width > cv.height * 1.15;
      const [PW, PH] = land ? [A4[1], A4[0]] : A4;
      const cap = opt.caption ? textCanvas(opt.caption, { width: 1600, size: 30, bold: true, color: '#1e3a8a' }) : null;
      const capH = cap ? (PW - 2 * M) * cap.height / cap.width : 0;
      const availW = PW - 2 * M, scale = availW / cv.width;
      let fullH = cv.height * scale;
      // 單頁可容納時（含些微超出），縮放至一頁
      const firstAvail = PH - 2 * M - capH - (cap ? 6 : 0);
      if (fullH <= firstAvail * 1.25 || opt.fit) {
        const s = Math.min(scale, firstAvail / cv.height);
        const page = this.newPage(land);
        if (cap) page.drawImage(await this.embedCanvas(cap), { x: M, y: PH - M - capH, width: availW, height: capH });
        const img = await this.embedCanvas(cv);
        const w = cv.width * s, h = cv.height * s;
        page.drawImage(img, { x: (PW - w) / 2, y: PH - M - capH - (cap ? 6 : 0) - h, width: w, height: h });
        return;
      }
      // 分頁切割：優先在列、標題、公式框等區塊之間換頁，避免把一列或一個公式切成兩半
      const breaks = (opt.breaks || []).slice().sort((a, b) => a - b);
      let y = 0, first = true;
      while (y < cv.height - 2) {
        const avail = (first ? firstAvail : PH - 2 * M) / scale;
        let sliceH = Math.min(avail, cv.height - y);
        if (y + avail < cv.height - 2) {
          const ok = breaks.filter(b => b > y + avail * 0.35 && b <= y + avail);
          if (ok.length) sliceH = ok[ok.length - 1] - y;
        }
        const part = document.createElement('canvas'); part.width = cv.width; part.height = Math.ceil(sliceH);
        const ctx = part.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, part.height);
        ctx.drawImage(cv, 0, y, cv.width, sliceH, 0, 0, cv.width, sliceH);
        const page = this.newPage(land);
        let top = PH - M;
        if (first && cap) { page.drawImage(await this.embedCanvas(cap), { x: M, y: top - capH, width: availW, height: capH }); top -= capH + 6; }
        page.drawImage(await this.embedCanvas(part), { x: M, y: top - sliceH * scale, width: availW, height: sliceH * scale });
        y += sliceH; first = false;
      }
    }

    async addImageUrl(dataUrl, caption) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('圖片讀取失敗')); i.src = dataUrl; });
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0);
      await this.addCanvas(cv, { caption, fit: true });
    }

    async addPdfUrl(dataUrl, caption) {
      try {
        const src = await PDFLib.PDFDocument.load(dataUrlBytes(dataUrl), { ignoreEncryption: true });
        const pages = await this.doc.copyPages(src, src.getPageIndices());
        pages.forEach(p => { this.doc.addPage(p); if (this.cur) this.cur.count++; });
        if (caption && pages[0]) {
          // 標題圖：依文字長度裁切，字高約 16pt
          const cap = document.createElement('canvas'), g = cap.getContext('2d'), fs = 48;
          g.font = `700 ${fs}px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif`;
          cap.width = Math.ceil(g.measureText(caption).width + fs * 0.6); cap.height = Math.ceil(fs * 1.4);
          g.fillStyle = '#fff'; g.fillRect(0, 0, cap.width, cap.height);
          g.font = `700 ${fs}px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif`; g.fillStyle = '#1e3a8a'; g.textBaseline = 'middle'; g.fillText(caption, fs * 0.3, cap.height / 2);
          const { width: pw, height: ph } = pages[0].getSize();
          const h = 22, w = Math.min(pw * 0.6, h * cap.width / cap.height);
          pages[0].drawRectangle({ x: 14, y: ph - h - 16, width: w + 8, height: h + 6, color: PDFLib.rgb(1, 1, 1), opacity: 0.92 });
          pages[0].drawImage(await this.embedCanvas(cap), { x: 18, y: ph - h - 13, width: w, height: h });
        }
      } catch (e) {
        this.log('⚠ PDF 無法直接合併（' + caption + '），改以影像方式加入');
        try {
          await PdfTools.load();
          const pdf = await pdfjsLib.getDocument({ data: dataUrlBytes(dataUrl) }).promise;
          for (let i = 1; i <= pdf.numPages; i++) { const r = await PdfTools.pageToDataUrl(dataUrl, i, 2200); await this.addImageUrl(r.dataUrl, i === 1 ? caption : null); }
        } catch (e2) { await this.addCanvas(textCanvas(['【無法讀取的 PDF 檔】' + caption, '請另行列印此附件。'], { size: 36 }), {}); }
      }
    }

    async addFile(f, caption) {
      if (f.type === 'application/pdf') await this.addPdfUrl(f.dataUrl, caption);
      else await this.addImageUrl(f.dataUrl, caption);
    }

    /* 在離屏 iframe 載入子頁面，套用列印樣式後擷取指定區塊 */
    async captureFrame(src, opt) {
      const fr = document.createElement('iframe');
      fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + (opt.width || 1100) + 'px;height:1600px;border:0;background:#fff;';
      fr.src = src;
      document.body.appendChild(fr);
      try {
        await new Promise((res, rej) => { fr.onload = res; setTimeout(() => rej(new Error('頁面載入逾時')), 30000); });
        const win = fr.contentWindow, doc = fr.contentDocument;
        await sleep(opt.wait || 700);
        // 示意圖等圖片載入完成再擷取（離屏 iframe 可能延後載入）
        await Promise.all(Array.from(doc.images).map(img => {
          img.loading = 'eager';
          if (img.complete) return null;
          return new Promise(res => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); setTimeout(res, 8000); });
        }));
        // html2canvas 會重新載入圖片，相對路徑＋中文資料夾時可能失敗：先轉成內嵌 data URL
        await Promise.all(Array.from(doc.images).filter(img => img.naturalWidth && !/^data:/.test(img.src)).map(img => new Promise(res => {
          try {
            const cv = doc.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            cv.getContext('2d').drawImage(img, 0, 0);
            img.addEventListener('load', res, { once: true }); setTimeout(res, 3000);
            img.src = cv.toDataURL('image/png');
          } catch (e) { res(); }
        })));
        if (opt.prepare) await opt.prepare(win, doc);
        if (opt.print !== false) emulatePrint(doc, opt.css || '');
        else { const st = doc.createElement('style'); st.textContent = '.no-print{display:none !important;}' + (opt.css || ''); doc.head.appendChild(st); }
        await sleep(300);
        await loadScript(LIB.h2c, win, w => w.html2canvas);
        const els = Array.from(doc.querySelectorAll(opt.selector)).filter(e => e.offsetHeight > 0);
        if (!els.length) throw new Error('找不到列印區塊');
        for (const el of els) {
          const land = opt.landscapeIf ? opt.landscapeIf(el) : undefined;
          if (opt.flatten !== false) flattenForms(doc, el);
          if (opt.fillA4) fillA4(el, !!land);
          drawSlashes(doc, el);
          await sleep(100);
          const brk = safeBreaks(el);
          const cv = await win.html2canvas(el, { scale: opt.scale || 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: Math.max(el.scrollWidth + 40, opt.width || 1100) });
          const k = cv.height / (el.getBoundingClientRect().height || cv.height);
          await this.addCanvas(cv, { landscape: land, fit: !!opt.fit || !!opt.fillA4, breaks: brk.map(v => v * k) });
        }
        if (opt.after) await opt.after(win, doc);
      } finally { fr.remove(); }
    }

    async captureHtml(html, css, width = 1000) {
      const box = document.createElement('div');
      box.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;background:#fff;`;
      box.innerHTML = `<style>${css || ''}</style>${html}`;
      document.body.appendChild(box);
      try { await sleep(50); return await html2canvas(box, { scale: 2, backgroundColor: '#ffffff', logging: false }); }
      finally { box.remove(); }
    }
  }

  /* ---------------- 主流程 ---------------- */
  async function build(c, files, opt, log) {
    const B = new Builder(log);
    await B.init();
    const q = (k) => '?case=' + encodeURIComponent(c.id) + '&v=20261004y';   // 版本參數避免子頁面舊快取
    const fileList = (slot) => files.filter(f => f.slot === slot || f.slot.startsWith(slot + '#')).sort((a, b) => a.slot.localeCompare(b.slot));
    const S = opt.sections;
    const attach = async (slot, label) => {
      const fs = fileList(slot);
      if (!fs.length) { B.note(label + '（未上傳）', false); return; }
      for (let i = 0; i < fs.length; i++) { log('加入附件：' + label + (fs.length > 1 ? ` (${i + 1}/${fs.length})` : '')); await B.addFile(fs[i], label + (fs.length > 1 ? ` (${i + 1}/${fs.length})` : '')); }
      B.note(label);
    };
    const safe = async (label, fn) => {
      try { await fn(); B.note(label); }
      catch (e) { log('⚠ ' + label + '：' + e.message); B.note(label + '（產生失敗：' + e.message + '）', false); await B.addCanvas(textCanvas(['【' + label + '】產生失敗：' + e.message, '請另行列印此文件。'], { size: 36 })); }
    };

    // 1 檢查申請書
    B.section(1, '檢查申請書');
    if (S.apply) await safe('檢查申請書', async () => {
      log('擷取檢查申請書…');
      await B.captureFrame('申請書/print.html' + q(), { selector: '.a4', width: 900, print: false, fit: true, scale: 2.5, landscapeIf: () => false });
    });

    // 2 明細表
    B.section(2, '明細表');
    if (S.spec) await safe('移動式起重機明細表', async () => {
      log('擷取明細表…');
      await B.captureFrame('明細表/移動式起重機明細表.html' + q(), { selector: '#craneForm', width: 900, scale: 2.4, fit: true, landscapeIf: () => false, css: 'body.preview-mode .form-page,.form-page{box-shadow:none !important;}' });
    });

    // 3 組配圖或相當圖件
    B.section(3, '組配圖或相當圖件（照片及標註尺寸）');
    if (S.drawing) await B.divider('3', '組配圖或相當圖件', '照片及標註尺寸');
    if (S.drawing) {
      await safe('照片標註（正面／側面／伸臂全伸）', async () => {
        log('產生標註照片…');
        // 由標註工具（照片/annotate.html）以同一套繪圖程式輸出三張標註圖
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:900px;height:700px;border:0;';
        fr.src = '照片/annotate.html' + q() + '&render=all';
        document.body.appendChild(fr);
        let out = null;
        try {
          await new Promise((res, rej) => { fr.onload = res; setTimeout(() => rej(new Error('標註頁載入逾時')), 30000); });
          for (let i = 0; i < 100 && !fr.contentWindow.__annotDone; i++) await sleep(150);
          out = fr.contentWindow.__annotOut;
        } finally { fr.remove(); }
        if (!out) throw new Error('標註照片產生失敗');
        const titles = { 1: '正面照（外伸撐座全張）－外伸撐座全伸寬度', 2: '側面照－前輪中心至旋轉中心距離', 3: '伸臂全伸照－各節伸臂長度' };
        let any = false;
        for (const step of [1, 2, 3]) {
          const o = out[step];
          if (!o || !o.url) { B.note(titles[step] + '（未上傳）', false); continue; }
          any = true;
          await B.addImageUrl(o.url, titles[step]);
        }
        // 伸臂各節長度表
        const st = (c.boom.stages_m || []).map(Number).filter(x => x > 0);
        if (st.length) {
          const r2 = (v) => Math.round(v * 100) / 100;
          const html = `<table class="bt"><tr><th>節</th><th>各節長度 (m)</th><th>伸出至該節之伸臂總長 (m)</th></tr>${st.map((L, i) => `<tr><td>第 ${i + 1} 節${i ? '' : '（基本臂）'}</td><td>${r2(L - (i ? st[i - 1] : 0))}</td><td>${r2(L)}</td></tr>`).join('')}<tr><th>合計</th><th>${r2(st[st.length - 1])}</th><th>全伸 ${r2(st[st.length - 1])}</th></tr></table>`;
          const cv = await B.captureHtml(html, '.bt{border-collapse:collapse;width:100%;font-family:"Microsoft JhengHei",sans-serif;font-size:18px}.bt th,.bt td{border:1.5px solid #000;padding:8px 10px;text-align:center}.bt th{background:#f1f5f9}', 900);
          await B.addCanvas(cv, { caption: '伸臂全伸照－各節伸臂長度表', fit: true });
        }
        if (!any) throw new Error('尚未上傳組配圖照片');
      });
      await attach('hookPhoto', '吊鉤照片');
      await attach('ownerCert', '車主聯');
      await attach('license', '行照');
    }

    // 4,5 免付
    B.section(4, '設置場所平面圖及基礎概要'); B.cur.free = true;
    B.section(5, '設置固定方式'); B.cur.free = true;

    // 6 強度計算書或相當證明文件
    B.section(6, '強度計算書或相當證明文件');
    if (S.calc) await B.divider('6', '強度計算書或相當證明文件', '鋼索及吊鉤強度計算書、安定度計算書、荷重表');
    if (S.calc) {
      await safe('鋼索及吊鉤強度計算書', async () => {
        log('擷取鋼索／吊鉤強度計算…');
        await B.captureFrame('鋼索吊鉤計算/鋼索吊鉤計算.html' + q(), {
          selector: '.doc-page', width: 1000,
          prepare: (win) => { try { win.switchTab('all'); } catch (e) {} },
          css: '.tab-hidden{display:block !important;}'
        });
      });
      await safe('安定度計算書', async () => {
        log('擷取安定度計算書…');
        await B.captureFrame('安定度/安定度計算.html' + q(), {
          selector: '.page', width: 1100,
          css: '.page{page-break-after:auto !important;} #a4Table input[type=number]{width:70px;} #a4Table tr:first-child th:last-child{display:none !important;}',
          landscapeIf: (el) => el.id === 'page-a4'
        });
      });
      await safe('荷重表（新）', async () => {
        log('擷取荷重表…');
        await B.captureFrame('荷重表/index.html' + q(), {
          selector: '#printArea', width: 800, scale: 2.6, print: false, fit: true, fillA4: true, landscapeIf: (el) => el.offsetWidth > el.offsetHeight * 1.15,
          css: '.load-table th,.load-table td,.load-cell-content,.load-table .cell-input{font-size:19px !important;} .boom-super-header{font-size:21px !important;} .table-title-input{font-size:30px !important;} .editable-unit,.unit-box{font-size:18px !important;} .editable-notes,.note-label{font-size:16px !important;}' +
            ' .cell-actions,.th-del-btn{display:none !important;} .printable-sheet{box-shadow:none !important;border:0 !important;padding:6px !important;} .cell-input,.editable-notes,.editable-unit,.table-title-input{border-color:transparent !important;background:transparent !important;}' +
            ' .load-table{border-collapse:separate !important;border-spacing:0 !important;border:0 !important;border-top:2px solid #000 !important;border-left:2px solid #000 !important;}' +
            ' .load-table th,.load-table td{border:0 !important;border-right:1.5px solid #000 !important;border-bottom:1.5px solid #000 !important;} .load-table td.cap-b{border-bottom:4px solid #000 !important;} .load-table td.cap-r{border-right:4px solid #000 !important;}' +
            ' .load-table tr > :last-child{border-right:2px solid #000 !important;} .load-table tfoot tr td,.load-table tfoot tr th{border-bottom:2px solid #000 !important;}'
        });
      });
      if (c.hasChart) await attach('origChart', '原廠荷重性能表（參考）');
    }

    // 7 材質證明
    B.section(7, '結構材料材質證明書或相當證明文件');
    { const d = Number(c.docs && c.docs.rope_d) || 0; B.cur.feeText = d > 0 ? `鋼索破斷荷重採計算值 ${d}²／20 ＝ ${Math.round(d * d / 20 * 1000) / 1000} 公噸，詳 6. 鋼索強度計算書` : '鋼索破斷荷重採計算值 d²／20（未填鋼索直徑）'; }

    // 8 設置時間
    B.section(8, '設置時間相關證明文件');
    if (S.setup) { await B.divider('8', '設置時間相關證明文件', '購買證明、搭乘設備簽證報告、營利事業登記證'); await attach('setupProof', '進口報單／購買發票／購買證明或切結書'); await attach('platformReport', '搭乘設備簽證報告'); await attach('bizReg', '營利事業登記證'); }

    // 9 自行檢查
    B.section(9, '自行檢查紀錄');
    if (S.selfcheck) await B.divider('9', '自行檢查紀錄');
    if (S.selfcheck) await safe('移動式起重機自行檢查紀錄', async () => {
      log('擷取自行檢查紀錄…');
      // 採用畫面樣式（與前端檢視一致），不套用縮小字級的列印樣式
      await B.captureFrame('自行檢查紀錄表/移動式起重機自行檢查紀錄.html' + q(), {
        selector: '#printableForm', width: 1100, print: false, flatten: false, scale: 2,
        prepare: (win, doc) => { doc.querySelectorAll('[placeholder]').forEach(el => el.removeAttribute('placeholder')); },
        css: '.notice-banner,.toolbar{display:none !important;} body{background:#fff !important;} .container{margin:0 !important;padding:0 !important;max-width:none !important;}' +
          ' .form-page{box-shadow:none !important;margin:0 !important;} .result-input,.full-input,.inline-input{caret-color:transparent;}'
      });
    });

    B.section(10, '吊升裝置等之等級及作業係數確認'); B.cur.free = true;
    B.section(11, '檢查規費'); B.cur.feeText = `${(c.fee && c.fee.amount) || 2640} 元，以郵局匯票或即期支票郵寄至代行檢查機構（受款人：勞動部職業安全衛生署）`;

    if (S.extra && fileList('other').length) {
      B.section('附', '其他附件');
      await B.divider('附', '其他附件');
      await attach('other', '其他附件');
    }

    // 封面與目錄
    log('製作封面與目錄…');
    const before = B.doc.getPageCount();
    let offset = 1, tmp;
    for (let k = 0; k < 3; k++) {
      const cv = await B.captureHtml(coverHtml(c, B.toc, offset), COVER_CSS, 1000);
      tmp = new Builder(log); tmp.doc = await PDFLib.PDFDocument.create();
      await tmp.addCanvas(cv, {});
      if (tmp.doc.getPageCount() === offset) break;
      offset = tmp.doc.getPageCount();
    }
    const coverCopied = await B.doc.copyPages(tmp.doc, tmp.doc.getPageIndices());
    coverCopied.forEach((p, i) => B.doc.insertPage(i, p));
    // 頁碼
    const total = B.doc.getPageCount();
    B.doc.getPages().forEach((p, i) => {
      const { width } = p.getSize(); const t = `- ${i + 1} / ${total} -`;
      p.drawText(t, { x: width / 2 - B.font.widthOfTextAtSize(t, 9) / 2, y: 10, size: 9, font: B.font, color: PDFLib.rgb(0.4, 0.4, 0.4) });
    });
    B.doc.setTitle('移動式起重機檢查申請資料 ' + (c.company.name || c.name));
    const bytes = await B.doc.save();
    log(`完成：共 ${total} 頁（文件 ${before} 頁＋封面目錄 ${coverCopied.length} 頁）`);
    return { blob: new Blob([bytes], { type: 'application/pdf' }), pages: total };
  }

  const COVER_CSS = `
    .cv{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;color:#0f172a;padding:40px 46px;}
    .cv h1{font-size:30px;text-align:center;margin:10px 0 6px;letter-spacing:3px;}
    .cv .sub{text-align:center;color:#475569;font-size:15px;margin-bottom:24px;}
    .cv table{width:100%;border-collapse:collapse;font-size:15px;margin-bottom:22px;}
    .cv th,.cv td{border:1px solid #334155;padding:8px 10px;vertical-align:top;}
    .cv th{background:#e2e8f0;}
    .cv .info td:nth-child(odd){background:#f1f5f9;font-weight:700;width:18%;}
    .cv .pg{text-align:center;white-space:nowrap;width:90px;}
    .cv .no{text-align:center;width:46px;}
    .cv ul{margin:2px 0 0 18px;padding:0;font-size:13px;}
    .cv li.miss{color:#b91c1c;}
    .cv .foot{font-size:12px;color:#475569;line-height:1.6;}`;

  function coverHtml(c, toc, offset) {
    const e = (s) => String(s == null ? '' : s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const r = c.result && c.result.ok ? c.result : null;
    const d = new Date();
    return `<div class="cv">
      <h1>移動式起重機（搭乘設備）檢查申請資料</h1>
      <div class="sub">三公噸以下移動式起重機強度計算替代方案（安定度計算）　‧　製表日期：民國 ${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日</div>
      <table class="info">
        <tr><td>事業單位</td><td>${e(c.company.name)}</td><td>統一編號</td><td>${e(c.company.tax_id)}</td></tr>
        <tr><td>車牌號碼</td><td>${e(c.vehicle.plate)}</td><td>機具</td><td>${e([c.crane.type, c.crane.maker, c.crane.model].filter(Boolean).join(' '))}</td></tr>
        <tr><td>搭乘設備</td><td>重量 ${e(c.platform.weight_kg)} kg ＋ 載重 ${e(c.platform.payload_kg)} kg</td><td>申請吊升荷重</td><td><b>${r ? r.liftT.toFixed(2) + ' 公噸' : '（未計算）'}</b>${r ? `<br><small>額定荷重 (搭乘設備＋載重)×2 = ${r.cap} kg ＋ 吊具 ${(r.liftCap || r.cap) - r.cap} kg</small>` : ''}</td></tr>
        <tr><td>承辦人</td><td>${e(c.company.contact)}</td><td>聯絡電話</td><td>${e(c.company.mobile || c.company.tel)}</td></tr>
      </table>
      <table>
        <tr><th class="no">項次</th><th>名稱</th><th>檢附內容</th><th class="pg">頁次</th></tr>
        ${toc.map(t => `<tr><td class="no">${t.no}</td><td><b>${e(t.title)}</b></td>
          <td>${t.free ? '免付' : t.feeText ? e(t.feeText) : `<ul>${t.items.map(x => `<li>${e(x)}</li>`).join('')}${t.missing.map(x => `<li class="miss">${e(x)}</li>`).join('')}</ul>`}</td>
          <td class="pg">${t.count ? `${t.start + offset}${t.count > 1 ? '–' + (t.start + offset + t.count - 1) : ''}` : '—'}</td></tr>`).join('')}
      </table>
      <div class="foot">本資料由事業單位使用「三噸以下起重機申請」工具產出，所載資料、量測值及附件之真實性由事業單位負責。吊升荷重及荷重表以檢查機構審查及現場檢查結果為準。</div>
    </div>`;
  }

  return { build };
})();
