/**
 * 申請案資料隔離橋接 (case-bridge.js)
 * ------------------------------------------------------------
 * 各子頁面（荷重表、安定度、明細表…）原本各自用固定的 localStorage key 存檔。
 * 由主控台以 ?case=<申請案ID> 開啟時，本腳本會把所有 localStorage 讀寫
 * 自動加上「case:<ID>:」前綴，讓每個申請案的資料互不干擾。
 * 必須在子頁面其他 <script> 之前載入。
 */
(function () {
  const params = new URLSearchParams(location.search);
  const caseId = params.get('case');
  window.CASE_ID = caseId || null;
  if (!caseId) return;

  const prefix = 'case:' + caseId + ':';
  const proto = Storage.prototype;
  const rawGet = proto.getItem, rawSet = proto.setItem, rawRemove = proto.removeItem;
  const isLocal = (s) => { try { return s === window.localStorage; } catch (e) { return false; } };

  proto.getItem = function (k) { return rawGet.call(this, isLocal(this) ? prefix + k : k); };
  proto.setItem = function (k, v) {
    const r = rawSet.call(this, isLocal(this) ? prefix + k : k, v);
    if (isLocal(this)) {
      try { rawSet.call(this, prefix + '__touched', new Date().toISOString()); } catch (e) {}
      try { if (window.parent !== window) window.parent.postMessage({ type: 'case-saved', caseId, key: k }, '*'); } catch (e) {}
    }
    return r;
  };
  proto.removeItem = function (k) { return rawRemove.call(this, isLocal(this) ? prefix + k : k); };

  /* ---- 大型檔案（照片）改存 IndexedDB，避免 localStorage 5MB 上限 ---- */
  const DB_NAME = 'crane3t_files', STORE = 'files';
  function openDb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('caseId', 'caseId');
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  window.CaseFiles = {
    async put(slot, name, type, dataUrl) {
      const db = await openDb();
      const rec = { id: caseId + ':' + slot, caseId, slot, name, type, dataUrl, savedAt: Date.now() };
      await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      try { if (window.parent !== window) window.parent.postMessage({ type: 'case-saved', caseId, key: 'file:' + slot }, '*'); } catch (e) {}
      return rec;
    },
    async get(slot) {
      const db = await openDb();
      return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(caseId + ':' + slot); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
    }
  };

  /* ---- 顯示目前申請案提示列（獨立分頁開啟時才顯示） ---- */
  if (window.parent === window) {
    document.addEventListener('DOMContentLoaded', () => {
      const bar = document.createElement('div');
      bar.className = 'no-print';
      bar.style.cssText = 'background:#0f766e;color:#fff;font-size:13px;padding:6px 14px;display:flex;gap:12px;align-items:center;font-family:inherit;';
      bar.innerHTML = '📁 目前編輯申請案資料（自動儲存於本瀏覽器）<a style="color:#fff;margin-left:auto;font-weight:bold" href="' +
        new URL('../index.html#case=' + encodeURIComponent(caseId), location.href).href + '">← 回到申請案總覽</a>';
      document.body.prepend(bar);
    });
  }
})();
