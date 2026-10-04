/* 明細表增強：A4 滿版、上一步（最多 10 次）、範例資料不覆蓋實際資料
 * 依附於主程式之 getFormData / setFormData / autoSave / showToast / SAMPLE_DATA。 */
(function () {
  const form = document.getElementById('craneForm');
  if (!form) return;
  const HKEY = 'crane_form_undo', MAX = 10;

  /* ---------- A4 滿版：拉高表格列，使內容剛好填滿 297mm ---------- */
  const style = document.createElement('style');
  style.textContent = `
    #craneForm.a4-compact table.sheet-table th, #craneForm.a4-compact table.sheet-table td { height: 22px; padding: 1px 4px; }
    #craneForm.a4-compact .stamp-box { height: 92px; }
    #craneForm.a4-compact textarea.form-textarea { line-height: 1.25; }
    #craneForm.a4-compact .doc-header { margin-bottom: 4px; }`;
  document.head.appendChild(style);
  const kids = () => Array.from(form.children);
  function measure() {
    const cs = getComputedStyle(form);
    const avail = form.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
    let used = 0; kids().forEach(ch => { const m = getComputedStyle(ch); used += ch.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom); });
    return { avail, used };
  }
  function fitA4() {
    const rows = Array.from(form.querySelectorAll('table.sheet-table > tbody > tr'));
    rows.forEach(r => { r.style.height = ''; });
    kids().forEach(ch => { ch.style.zoom = ''; });
    form.classList.remove('a4-compact');
    let m = measure();
    if (m.used > m.avail) { form.classList.add('a4-compact'); m = measure(); }
    if (m.used > m.avail) {
      // 仍超出：等比例縮小內容，確保單頁 A4
      const z = Math.max(0.8, m.avail / m.used);
      kids().forEach(ch => { ch.style.zoom = z; });
      return;
    }
    const extra = m.avail - m.used;
    if (extra <= 4 || !rows.length) return;
    const grow = rows.filter(r => r.classList.contains('grow'));
    const target = grow.length ? grow : rows;
    const add = extra / target.length;
    target.forEach(r => { r.style.height = (r.offsetHeight + add) + 'px'; });
  }
  window.fitA4 = fitA4;
  window.addEventListener('load', () => setTimeout(fitA4, 50));
  window.addEventListener('resize', () => { clearTimeout(fitA4._t); fitA4._t = setTimeout(fitA4, 150); });
  window.addEventListener('beforeprint', fitA4);

  /* ---------- 上一步 ---------- */
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { hist = []; }
  const snap = () => JSON.stringify(getFormData());
  const persist = () => { try { localStorage.setItem(HKEY, JSON.stringify(hist)); } catch (e) {} };
  function updateBtn() {
    const n = Math.max(0, hist.length - 1);
    const b = document.getElementById('btnUndo'); if (b) b.disabled = n === 0;
    const c = document.getElementById('undoCount'); if (c) c.textContent = n ? `(${n})` : '';
  }
  function record() {
    const s = snap();
    if (hist[hist.length - 1] === s) return;
    hist.push(s);
    while (hist.length > MAX + 1) hist.shift();
    persist(); updateBtn();
  }
  window.recordSpec = record;
  window.undoSpec = function () {
    if (hist.length < 2) return;
    hist.pop();
    const prev = JSON.parse(hist[hist.length - 1]);
    form.reset();
    setFormData(prev);
    autoSave();
    persist(); updateBtn(); fitA4();
    showToast('已復原上一步（剩餘 ' + (hist.length - 1) + ' 次）');
  };
  let t = null;
  form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(record, 700); });
  form.addEventListener('change', () => { clearTimeout(t); t = setTimeout(record, 300); });

  /* ---------- 帶入範例：不覆蓋事業單位資料與已填欄位 ---------- */
  const PROTECTED = ['company_name', 'crane_serial_no', 'company_address', 'industry_type', 'install_address', 'owner_name',
    'crane_model_type', 'company_tel', 'lifting_capacity', 'contact_tel'];
  window.fillSampleData = function () {
    record();
    const cur = getFormData(), data = {};
    let n = 0;
    for (const [k, v] of Object.entries(SAMPLE_DATA)) {
      if (PROTECTED.includes(k)) continue;
      if (cur[k] !== undefined && String(cur[k]).trim() !== '') continue;
      data[k] = v; n++;
    }
    setFormData(data);
    autoSave(); record(); fitA4();
    showToast(n ? `已於 ${n} 個空白欄位帶入範例（事業單位資料與已填內容未變更）` : '沒有空白欄位需要帶入範例');
  };
  const origReset = window.resetForm;
  window.resetForm = function () { record(); origReset(); autoSave(); record(); fitA4(); };
  const origImport = window.importJSON;
  window.importJSON = function (e) { record(); origImport(e); setTimeout(() => { record(); fitA4(); }, 300); };

  window.addEventListener('DOMContentLoaded', () => { setTimeout(() => { record(); updateBtn(); }, 0); });
})();
