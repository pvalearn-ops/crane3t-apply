/* 鋼索吊鉤計算：每次存檔時一併記錄判定結果，供申請案總覽顯示狀態 */
(function () {
  // 申請案模式且尚無資料：清除範例數值，避免誤當實測值
  if (window.CASE_ID && !localStorage.getItem('crane3t_rope_hook_calc')) {
    ['applicant', 'craneModel', 'plateNo', 'wire_applicant', 'wire_craneModel', 'wire_plateNo',
     'hook_Q', 'hook_d', 'hook_B1', 'hook_b1', 'hook_h1', 'hook_B2', 'hook_b2', 'hook_h2',
     'wire_d', 'wire_Wrated', 'wire_Whook', 'wire_Pbreak', 'wire_type'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const ps = document.getElementById('presetSelect'); if (ps) ps.value = '';
  }
  // 吊鉤無材質證明時之註記
  function matNote() {
    const sel = document.getElementById('hook_mat'), n = document.getElementById('hookMatNote');
    if (sel && n) n.textContent = /^NOCERT/.test(sel.value) ? '※ 無吊鉤材質證明，抗拉強度取 4500 kg/cm²' : '';
  }
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'hook_mat') matNote(); });
  window.addEventListener('DOMContentLoaded', () => setTimeout(matNote, 0));
  const orig = window.saveData;
  if (typeof orig !== 'function') return;
  const txt = (id) => (document.getElementById(id) || {}).textContent || '';
  window.saveData = function () {
    const r = orig.apply(this, arguments);
    const hook = txt('sum_final_hook'), wire = txt('sum_wire_judge');
    try {
      localStorage.setItem('crane3t_rope_hook_result', JSON.stringify({
        hookOk: /合格/.test(hook) && !/不合格/.test(hook),
        wireOk: /合格/.test(wire) && !/不合格/.test(wire),
        hookText: hook, wireText: wire, wireSF: txt('res_wire_S'), at: new Date().toISOString()
      }));
    } catch (e) {}
    return r;
  };
})();
