# 三噸以下移動式起重機（搭乘設備）檢查申請工具

靜態網站（HTML／JavaScript），可直接以 GitHub Pages 發布；資料只存在使用者自己的瀏覽器。

## 發布到 GitHub Pages
1. 在 GitHub 建立新的 repository，把本資料夾全部內容上傳（或用 git push）。
2. Settings → Pages → Source 選「Deploy from a branch」，Branch 選 `main`、資料夾 `/ (root)`，按 Save。
3. 約 1～2 分鐘後網址為 `https://<帳號>.github.io/<repo 名稱>/`。

## AI 解析
經由 Google Apps Script 轉送至 Gemini API，程式在 `gas/Code.gs`，部署方式見 `gas/部署說明.md`。
Apps Script 網址與存取碼寫在 `hub/ai.js`（`DEFAULT_URL`、`DEFAULT_TOKEN`），網站公開後任何人都看得到，
因此 Apps Script 設有每日呼叫上限（指令碼屬性 `DAILY_LIMIT`，預設 500 次）；存取碼外流時請更換。

## 注意
- 需連網（PDF 產出、Word 產生等工具程式由 CDN 載入）。
- 申請案資料存在瀏覽器（localStorage／IndexedDB），換網址或換電腦需用「匯出備份」再「匯入」。
