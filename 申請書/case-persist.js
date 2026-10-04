/* 申請書：即時自動儲存／還原（localStorage 'apply_form_draft'，由 case-bridge 依申請案隔離） */
(function () {
  const KEY = 'apply_form_draft';
  const form = document.getElementById('applyForm');
  if (!form) return;
  const fields = () => Array.from(form.querySelectorAll('input[id], select[id], textarea[id]'));

  function collect() {
    const d = { values: {}, checked: {} };
    fields().forEach(el => { if (el.type === 'checkbox' || el.type === 'radio') d.checked[el.id] = el.checked; else d.values[el.id] = el.value; });
    return d;
  }
  function restore() {
    let d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!d) return;
    fields().forEach(el => {
      if (el.type === 'checkbox' || el.type === 'radio') { if (d.checked && el.id in d.checked) el.checked = !!d.checked[el.id]; }
      else if (d.values && el.id in d.values) el.value = d.values[el.id];
    });
  }
  let t = null;
  function save() { clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(collect())); } catch (e) {} }, 300); }
  restore();
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  window.addEventListener('beforeunload', () => { clearTimeout(t); try { localStorage.setItem(KEY, JSON.stringify(collect())); } catch (e) {} });
})();
