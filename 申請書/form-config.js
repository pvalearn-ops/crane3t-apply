/* 申請書：三噸以下移動式起重機（搭乘設備）專用設定
 *  - 機具種類固定「移動式起重機」、檢查種類固定「既有機械檢查」
 *  - 預設種類及型式、檢查費
 *  - 受檢地點：縣市／鄉鎮市區（含郵遞區號）選單 → 自動組成地址，並依轄區帶入代行檢查機構
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = 'apply_form_draft';
  let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  const sv = (id) => saved && saved.values ? saved.values[id] : undefined;
  const fire = (el) => el.dispatchEvent(new Event('input', { bubbles: true }));

  /* ---- 固定值 ---- */
  const mt = $('machineType');
  if (mt) { mt.value = 'm2'; mt.disabled = true; Array.from(mt.options).forEach(o => { if (o.value !== 'm2') o.hidden = true; }); }
  ['t1', 't2', 't3', 't5', 't6', 't7'].forEach(id => { const el = $(id); if (el) { el.checked = false; el.closest('label').style.display = 'none'; } });
  const t4 = $('t4'); if (t4) { t4.checked = true; t4.disabled = true; }
  const lbl = document.querySelector('.checkbox-group .field-label'); if (lbl) lbl.textContent = '檢查種類：';
  if ($('type_model') && !$('type_model').value) $('type_model').value = '積載型起重機';
  if ($('fee') && !$('fee').value) $('fee').value = '2640';

  /* ---- 受檢地點：縣市／鄉鎮市區選單 ---- */
  const addr = $('address');
  if (!addr || !window.TW_ZIP) return;
  const grp = addr.closest('.form-group');
  grp.querySelector('.field-label').textContent = '設置地址或受檢地點（請先選縣市、鄉鎮市區）：';
  const box = document.createElement('div');
  box.className = 'addr-picker';
  box.innerHTML = `
    <select id="addr_county"><option value="">-- 縣市 --</option>${TW_ZIP.counties.map(c => `<option>${c}</option>`).join('')}</select>
    <select id="addr_district"><option value="">-- 鄉鎮市區 --</option></select>
    <input type="text" id="addr_zip" readonly placeholder="郵遞區號" style="width:90px;text-align:center;background:#f1f5f9">
    <input type="text" id="addr_detail" placeholder="路段、巷弄、門牌號碼" style="flex:1;min-width:200px">`;
  grp.insertBefore(box, addr);
  addr.readOnly = true; addr.style.background = '#f8fafc'; addr.title = '由上方選單與門牌自動組成';
  const agencyBox = document.createElement('div');
  agencyBox.className = 'agency-box';
  grp.appendChild(agencyBox);

  const cSel = $('addr_county'), dSel = $('addr_district'), zip = $('addr_zip'), det = $('addr_detail');
  function fillDistricts(county, keep) {
    dSel.innerHTML = '<option value="">-- 鄉鎮市區 --</option>' + (TW_ZIP.data[county] || []).map(d => `<option value="${d.name}" data-zip="${d.zip}">${d.name}（${d.zip}）</option>`).join('');
    if (keep) dSel.value = keep;
  }
  function compose(silent) {
    const opt = dSel.selectedOptions[0];
    zip.value = opt && opt.dataset.zip ? opt.dataset.zip : '';
    addr.value = (zip.value || '') + (cSel.value || '') + (dSel.value || '') + (det.value || '');
    renderAgency();
    if (!silent) fire(addr);
  }
  function renderAgency() {
    const a = TW_ZIP.agencyFor(cSel.value);
    agencyBox.innerHTML = a
      ? `<b>代行檢查機構（依受檢地自動判定）：</b>${a.regionLabel} → <b>${a.name}</b><br><small>地址：${a.address}（代行檢查組）　電話：${a.tel}　傳真：${a.fax}</small>`
      : '<span style="color:#b45309">請選擇受檢地點縣市，系統會自動帶入該轄區之代行檢查機構。</span>';
  }

  // 還原：優先使用已存的選單值；否則由既有地址字串推斷縣市
  let county = sv('addr_county'), district = sv('addr_district'), detail = sv('addr_detail');
  if (!county && addr.value) {
    county = TW_ZIP.countyFromAddress(addr.value) || '';
    if (county) {
      const rest = addr.value.replace(/^\d{3,6}/, '').replace(/^台/, '臺').slice(county.length);
      const d = (TW_ZIP.data[county] || []).find(x => rest.startsWith(x.name));
      district = d ? d.name : ''; detail = d ? rest.slice(d.name.length) : rest;
    }
  }
  if (county) { cSel.value = county; fillDistricts(county, district || ''); }
  det.value = detail || '';
  if (county) compose(true); else renderAgency();

  cSel.addEventListener('change', () => { fillDistricts(cSel.value); compose(); });
  dSel.addEventListener('change', () => compose());
  det.addEventListener('input', () => compose());

  /* 供 generateWord 使用 */
  window.getAgencyData = function () {
    const a = TW_ZIP.agencyFor(cSel.value);
    return a ? { agency_name: a.name, agency_address: a.address, agency_tel: a.tel, agency_fax: a.fax }
             : { agency_name: '', agency_address: '', agency_tel: '', agency_fax: '' };
  };
})();
