/**
 * 申請案資料儲存層
 *  - 案件清單：localStorage 'hub:cases'
 *  - 案件主資料：localStorage 'case:<id>:hub'
 *  - 各子頁面資料：localStorage 'case:<id>:<原key>'（由 shared/case-bridge.js 寫入）
 *  - 上傳檔案/照片：IndexedDB 'crane3t_files'
 */
const Store = (() => {
  const INDEX_KEY = 'hub:cases';
  const AGREE_KEY = 'hub:agreed_v1';
  const DB_NAME = 'crane3t_files', STORE = 'files';

  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const readJSON = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const writeJSON = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { alert('瀏覽器儲存空間不足，資料可能未完整保存！請先匯出備份。\n' + e.message); return false; }
  };

  /* S4 系統預帶值（畫面上標示「預帶」，使用者可修改） */
  const DOC_PRESET = {
    angle_min: '0', rotation_limit: '360', engine_purpose: '走行/起重', engine_type: '柴油引擎',
    brakes: '捲揚、旋轉用－油壓制動煞車\n起伏、伸縮用－油壓缸行程逆止閥',
    drum_dia: '160', sheave_dia: '160',
    safe_overhoist: '有', safe_hook_latch: '有', safe_overload: '有', safe_hydraulic_valves: '有', safe_boom_backstop: '無', safe_angle_indicator: '有', safe_wire_slack: '有',
    rope_type: 'IWRC6×Fi(29)O/O', rope_d: '8', rope_n: '4',
    speed_slew: '2.5'
  };

  function emptyCase(name) {
    return {
      version: 1,
      name: name || '未命名申請案',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasChart: null,             // true=有原廠荷重表；false=無
      company: { name: '', tax_id: '', address: '', addr_county: '', addr_district: '', addr_detail: '', owner: '', industry: '', tel: '', contact: '', mobile: '' },
      vehicle: { plate: '', owner_name: '', make: '', model: '', body_type: '', mfg_date: '', engine_no: '', vin: '',
                 gross_weight_kg: '', empty_weight_kg: '', length_cm: '', width_cm: '', height_cm: '', wheelbase_cm: '', front_track_cm: '', rear_track_cm: '' },
      site: { county: '', district: '', detail: '' },
      crane: { maker: '', model: '', serial: '', orig_capacity_t: '', mfg_year: '', type: '積載型起重機', dbModel: '' },
      platform: { no: '', weight_kg: '', payload_kg: '' },
      boom: { stages_m: [], numCyl: '', segW: [], cylW: [], weightMode: 'auto' },
      stab: { Wb: '', Wf: '', Wh: '', B1: '', B2: '', Lw: '', thetaM: '', S: '', h1: '', h2: '', h3: '', h4: '' },
      origChart: { booms: [], radii: [], cells: [] },  // cells[r][c] = 文字 ('' 空白, '/' 斜線)
      fee: { method: '', amount: '2640', paid: false },
      // S4 申請文件資料（套用時帶入申請書、明細表、鋼索吊鉤計算書、自行檢查紀錄）
      docs: Object.assign({
        req_date: '', mail_address: '', fax: '', maint_comp: '', maint_contact: '', maint_tel: '', receipt_title: '', receipt_address: '', note: '',
        speed_hoist: '', speed_luff: '', engine_power: '', safe_other: '',
        rope_pbreak: '', rope_pbreak_unit: 'kg', hook_opening: '',
        hook_d: '', hook_B1: '', hook_b1: '', hook_h1: '', hook_B2: '', hook_b2: '', hook_h2: ''
      }, DOC_PRESET),
      appliedAt: null,            // 最後一次「套用到申請文件」時間；套用前申請文件不顯示
      needReapply: false,         // 套用後 S1–S5 又有變更
      result: null,
      manual: {},                 // 文件項目手動標記 { itemId: 'done' }
      aiLog: []
    };
  }

  function list() { return readJSON(INDEX_KEY, []); }
  function saveIndex(arr) { writeJSON(INDEX_KEY, arr); }

  function get(id) {
    const c = readJSON('case:' + id + ':hub', null);
    if (!c) return null;
    // 補齊新版欄位
    const base = emptyCase();
    for (const k of Object.keys(base)) {
      if (c[k] === undefined) c[k] = base[k];
      else if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && c[k] && typeof c[k] === 'object')
        c[k] = Object.assign({}, base[k], c[k]);
    }
    c.id = id;
    return c;
  }

  function save(c) {
    c.updatedAt = new Date().toISOString();
    const ok = writeJSON('case:' + c.id + ':hub', c);
    const idx = list();
    const e = idx.find(x => x.id === c.id);
    const meta = { id: c.id, name: c.name, company: c.company.name, plate: c.vehicle.plate, updatedAt: c.updatedAt, createdAt: c.createdAt };
    if (e) Object.assign(e, meta); else idx.unshift(meta);
    saveIndex(idx);
    return ok;
  }

  function create(name) {
    const c = emptyCase(name);
    c.id = uid();
    save(c);
    return c;
  }

  function caseKeys(id) {
    const pre = 'case:' + id + ':', out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) out.push(k.slice(pre.length)); }
    return out;
  }
  const subGet = (id, key) => readJSON('case:' + id + ':' + key, null);
  const subSet = (id, key, val) => writeJSON('case:' + id + ':' + key, val);

  /* ---------------- IndexedDB 檔案 ---------------- */
  function openDb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) { const os = db.createObjectStore(STORE, { keyPath: 'id' }); os.createIndex('caseId', 'caseId'); }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode); const os = t.objectStore(STORE);
      let out; const r = fn(os); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
    });
  }
  const filePut = (caseId, slot, name, type, dataUrl) =>
    tx('readwrite', os => os.put({ id: caseId + ':' + slot, caseId, slot, name, type, dataUrl, savedAt: Date.now() }));
  const fileGet = (caseId, slot) => tx('readonly', os => os.get(caseId + ':' + slot));
  const fileDel = (caseId, slot) => tx('readwrite', os => os.delete(caseId + ':' + slot));
  const filesOf = (caseId) => tx('readonly', os => os.index('caseId').getAll(caseId)).then(r => r || []);

  /* ---------------- 複製 / 刪除 / 匯出 / 匯入 ---------------- */
  async function duplicate(id) {
    const src = get(id); if (!src) return null;
    const c = JSON.parse(JSON.stringify(src));
    c.id = uid(); c.name = src.name + '（複本）'; c.createdAt = new Date().toISOString();
    save(c);
    for (const k of caseKeys(id)) if (k !== 'hub') localStorage.setItem('case:' + c.id + ':' + k, localStorage.getItem('case:' + id + ':' + k));
    for (const f of await filesOf(id)) await filePut(c.id, f.slot, f.name, f.type, f.dataUrl);
    return c;
  }

  async function remove(id) {
    for (const k of caseKeys(id)) localStorage.removeItem('case:' + id + ':' + k);
    for (const f of await filesOf(id)) await fileDel(id, f.slot);
    saveIndex(list().filter(x => x.id !== id));
  }

  async function exportCase(id, includeFiles) {
    const storage = {};
    for (const k of caseKeys(id)) storage[k] = localStorage.getItem('case:' + id + ':' + k);
    const files = includeFiles ? (await filesOf(id)).map(f => ({ slot: f.slot, name: f.name, type: f.type, dataUrl: f.dataUrl })) : [];
    return { format: 'crane3t-case', version: 1, exportedAt: new Date().toISOString(), storage, files };
  }

  async function importCase(obj) {
    if (!obj || obj.format !== 'crane3t-case' || !obj.storage || !obj.storage.hub) throw new Error('檔案格式不符，非本系統匯出的申請案。');
    const hub = JSON.parse(obj.storage.hub);
    const id = uid();
    hub.id = id; hub.name = (hub.name || '匯入申請案') + '（匯入）';
    for (const [k, v] of Object.entries(obj.storage)) if (k !== 'hub') localStorage.setItem('case:' + id + ':' + k, v);
    save(hub);
    for (const f of obj.files || []) await filePut(id, f.slot, f.name, f.type, f.dataUrl);
    return get(id);
  }

  return {
    list, get, save, create, duplicate, remove, exportCase, importCase,
    subGet, subSet, caseKeys, filePut, fileGet, fileDel, filesOf, DOC_PRESET,
    agreed: () => !!localStorage.getItem(AGREE_KEY),
    setAgreed: () => localStorage.setItem(AGREE_KEY, new Date().toISOString())
  };
})();
