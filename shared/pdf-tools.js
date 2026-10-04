/* PDF 工具：以 pdf.js 將 PDF 第 1 頁（或指定頁）轉成圖片 dataURL */
window.PdfTools = (() => {
  const SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let loading = null;
  function load() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!loading) loading = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = SRC;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; res(window.pdfjsLib); };
      s.onerror = () => rej(new Error('無法載入 PDF 元件（請確認網路連線）'));
      document.head.appendChild(s);
    });
    return loading;
  }
  async function toBytes(src) {
    if (src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
    if (typeof src === 'string' && src.startsWith('data:')) { const b = atob(src.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return src;
  }
  async function pageToDataUrl(src, pageNo = 1, maxPx = 2000) {
    const lib = await load();
    const pdf = await lib.getDocument({ data: await toBytes(src) }).promise;
    const page = await pdf.getPage(Math.min(pageNo, pdf.numPages));
    const v1 = page.getViewport({ scale: 1 });
    const scale = maxPx / Math.max(v1.width, v1.height);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { dataUrl: cv.toDataURL('image/jpeg', 0.9), pages: pdf.numPages };
  }
  return { load, pageToDataUrl };
})();
