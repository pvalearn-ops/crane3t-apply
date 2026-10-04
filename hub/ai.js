/**
 * AI 文件解析（經由 Google Apps Script 轉送至 Google Gemini API）
 * ------------------------------------------------------------
 * 瀏覽器不直接持有 API Key：
 *   瀏覽器 ──(檔案＋提示詞＋存取碼)──▶ 您部署的 Google Apps Script（gas/Code.gs）──▶ Gemini API
 * Gemini API Key 存在 Apps Script 的「指令碼屬性」；Apps Script 網址與存取碼固定寫在本檔。
 * 兩種解析任務：
 *   docs  ：營利事業登記證、車主聯 → 事業單位、車籍資料
 *   chart ：原廠荷重性能表 → 荷重表轉錄、起重機型號
 * 亦提供「手動模式」：複製提示詞到任一 AI 對話介面，再把回覆的 JSON 貼回。
 */
const AI = (() => {
  const MODEL = 'gemini-3.1-flash-lite';   // 實際使用的模型由 Apps Script 指令碼屬性 MODEL 決定，此處僅供顯示
  // Apps Script 服務（固定於程式中，使用者介面不顯示）
  // ⚠ 存取碼寫在網頁原始碼中，取得網頁檔案者皆可看見並使用；網頁若公開發布，請移除並改由使用者自行輸入。
  const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbxNJZYQB561-odg5NtA-LemclhUm5W7rcq2C9IqI1RKaIgdzEl1JcMIkEQSTavUuLJv1Q/exec';
  const DEFAULT_TOKEN = 'spring36861_for_under3tonmobilecrane';

  const S = { type: 'string' };
  const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });

  const TASKS = {
    docs: {
      label: '營利事業登記證／車主聯',
      schema: obj({
        company: obj({ name: S, tax_id: S, address: S, owner: S, industry: S }),
        vehicle: obj({ plate: S, make: S, model: S, engine_no: S, engine_cc: S,
                       gross_weight_kg: S, empty_weight_kg: S, length_cm: S, width_cm: S, height_cm: S, wheelbase_cm: S, front_track_cm: S, rear_track_cm: S }),
        uncertain: { type: 'array', items: S }
      }),
      prompt: `你是台灣危險性機械（移動式起重機）檢查申請的文件判讀助理。請從附件影像/PDF 擷取資料，輸出 JSON。
規則：
1. 只填文件上看得到的內容；看不到或無法確定者填空字串 ""，並把欄位名稱與原因寫進 uncertain 陣列。不可猜測或編造。
2. company：營利事業登記證／商業登記／公司登記資料的 名稱、統一編號、地址、負責人、營業項目（industry 取主要行業別）。
3. vehicle：車主聯的 車牌號碼、廠牌、型式、引擎號碼；
   重量一律換算為 kg（總重量 gross_weight_kg、空重 empty_weight_kg）；長寬高、軸距、前輪距、後輪距一律換算為 cm（數字即可，不含單位）；
   engine_cc：引擎排氣量（cc，數字即可）。
只輸出 JSON。`
    },
    chart: {
      label: '原廠荷重性能表',
      schema: obj({
        crane: obj({ maker: S, model: S, orig_capacity_t: S, boom_angle_min: S, boom_angle_max: S }),
        load_chart: obj({
          present: { type: 'boolean' },
          radii_m: { type: 'array', items: S },
          booms: { type: 'array', items: obj({ boom_length_m: S, rope: S, loads: { type: 'array', items: S } }) },
          notes: S
        }),
        uncertain: { type: 'array', items: S }
      }),
      prompt: `你是台灣危險性機械（移動式起重機）檢查申請的文件判讀助理。附件為起重機原廠荷重性能表（機身貼紙、說明書或型錄頁面），請轉錄為 JSON。
規則：
1. 只填文件上看得到的內容；看不到或無法確定者填空字串 ""，並把欄位名稱與原因寫進 uncertain 陣列。不可猜測或編造。
2. crane：若可見起重機製造商、型號、原廠最大吊升荷重（公噸）、伸臂起伏角範圍（boom_angle_min／boom_angle_max，度，數字即可），請填入。
3. load_chart：present=true，並完整轉錄：
   - radii_m：表頭的每一個作業半徑欄都要列出（公尺，由小到大），數量必須等於表頭半徑欄的數量。
     表頭第一欄常是範圍（例如「0.73～2.7」「0.66～1.6」），它也是一個半徑欄，填上限（"2.7"、"1.6"），絕對不可省略。
   - booms：每一種伸臂長度（或伸出狀態）一筆，由短到長：
       boom_length_m：伸臂長度（公尺）。表上只有節數（①②③…）沒有長度時，依序填 "1"、"2"、"3"…，並在 uncertain 註明「伸臂長度未標示，請以實際長度修正」。
       rope：鋼索掛數（例如 "4本掛"），看不到填 ""。
       loads：這個伸臂長度在每個作業半徑的荷重，長度必須與 radii_m 相同，第 k 個對應 radii_m 第 k 個半徑。
         荷重一律換算成 kg（例如 2.24t → "2240"）；
         比此伸臂最小作業半徑更近、不能作業的半徑（表上空白在左側或畫斜線）填 "/"；
         超出此伸臂最大作業半徑（表上空白在右側）填 ""；
         一個數字橫跨好幾個半徑欄、並另註半徑（例如「1730 (2.62m)」）時，只填在它涵蓋的第一個半徑欄，寫成 "1730 (2.62m)"，其餘涵蓋的半徑欄：在它左側的填 "/"、在它右側的填 ""。
   - 表格方向：不論原表是「伸臂為列、半徑為欄」（如 UNIC 型錄）或「半徑為列、伸臂為欄」（常見機身貼紙），都照上述 booms 格式輸出，即「每個伸臂長度一串荷重」。
   - 若荷重表有多張（不同外伸撐座狀態），只取「外伸撐座最大張出」那一張，其餘寫入 notes。
   附件不是荷重表則 present=false，陣列給空陣列。
只輸出 JSON。`
    }
  };

  const getUrl = () => DEFAULT_URL;
  const getToken = () => DEFAULT_TOKEN;
  const ready = () => !!getUrl();

  function toFile(f) {
    const [head, data] = f.dataUrl.split(',');
    const mt = (head.match(/data:([^;]+)/) || [])[1] || f.type;
    return { label: f.label, media_type: mt, data };
  }

  async function call(body) {
    const url = getUrl();
    if (!url) throw new Error('尚未設定 Google Apps Script 網址。');
    // text/plain 可避免瀏覽器 CORS 預檢，Apps Script 網頁應用程式才收得到
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ token: getToken() }, body)) });
    if (!res.ok) throw new Error('Apps Script 回應 HTTP ' + res.status);
    let out; try { out = await res.json(); } catch (e) { throw new Error('Apps Script 回傳的不是 JSON，請確認部署為「網頁應用程式」且存取權為「所有人」。'); }
    if (!out.ok) throw new Error(out.error || 'Apps Script 回報錯誤');
    return out;
  }

  /** task: 'docs' | 'chart'；files: [{label, dataUrl, type}] */
  async function extract(task, files, onStatus) {
    const t = TASKS[task]; if (!t) throw new Error('未知的解析任務');
    onStatus && onStatus('上傳至 Apps Script，AI 解析中（約 10–60 秒）…');
    const out = await call({ action: 'extract', task, prompt: t.prompt, schema: t.schema, files: files.map(toFile) });
    return parseJson(out.text);
  }
  const ping = () => call({ action: 'ping' });

  function parseJson(text) {
    const s0 = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const s = s0.indexOf('{'), e = s0.lastIndexOf('}');
    if (s < 0 || e < 0) throw new Error('找不到 JSON 內容。');
    return JSON.parse(s0.slice(s, e + 1));
  }

  function manualPrompt(task) {
    const t = TASKS[task];
    return t.prompt + '\n\n請依照以下 JSON Schema 格式輸出：\n' + JSON.stringify(t.schema, null, 1);
  }

  return { extract, ping, parseJson, manualPrompt, ready, MODEL, TASKS };
})();
