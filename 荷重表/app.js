/**
 * 起重機額定荷重表核心邏輯
 * 依據截圖 (GW-QA-5975B) 與使用者需求建置
 */

// 預設標準範本 (截圖資料)
const DEFAULT_PRESET = {
  docTitle: "吊升荷重表",
  unit: "kg",
  notes: "本性能表只限用於外撐伸座最大張出之側及後方。",
  booms: ["4.84", "8.02", "11.21", "14.39", "17.57"],
  ropes: ["6本掛", "4本掛", "4本掛", "4本掛", "4本掛"],
  radiuses: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "17.3"],
  // cells[rowIndex][colIndex] = { text: string, isSlash: boolean }
  cells: [
    // 2m
    [
      { text: "4940", isSlash: false },
      { text: "", isSlash: true },
      { text: "", isSlash: true },
      { text: "", isSlash: true },
      { text: "", isSlash: true }
    ],
    // 3m
    [
      { text: "3720", isSlash: false },
      { text: "3070", isSlash: false },
      { text: "", isSlash: true },
      { text: "", isSlash: true },
      { text: "", isSlash: true }
    ],
    // 4m
    [
      { text: "2950", isSlash: false },
      { text: "2450", isSlash: false },
      { text: "2640", isSlash: false },
      { text: "", isSlash: true },
      { text: "", isSlash: true }
    ],
    // 5m
    [
      { text: "2240\n(4.57m)", isSlash: false },
      { text: "2030", isSlash: false },
      { text: "1780", isSlash: false },
      { text: "1630", isSlash: false },
      { text: "", isSlash: true }
    ],
    // 6m
    [
      { text: "", isSlash: false },
      { text: "1730", isSlash: false },
      { text: "1500", isSlash: false },
      { text: "1350", isSlash: false },
      { text: "1260", isSlash: false }
    ],
    // 7m
    [
      { text: "", isSlash: false },
      { text: "1460", isSlash: false },
      { text: "1290", isSlash: false },
      { text: "1150", isSlash: false },
      { text: "1060", isSlash: false }
    ],
    // 8m
    [
      { text: "", isSlash: false },
      { text: "1160\n(7.75m)", isSlash: false },
      { text: "1120", isSlash: false },
      { text: "1000", isSlash: false },
      { text: "930", isSlash: false }
    ],
    // 9m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "990", isSlash: false },
      { text: "870", isSlash: false },
      { text: "820", isSlash: false }
    ],
    // 10m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "870", isSlash: false },
      { text: "770", isSlash: false },
      { text: "750", isSlash: false }
    ],
    // 11m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "640\n(10.94m)", isSlash: false },
      { text: "670", isSlash: false },
      { text: "610", isSlash: false }
    ],
    // 12m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "620", isSlash: false },
      { text: "520", isSlash: false }
    ],
    // 13m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "520", isSlash: false },
      { text: "480", isSlash: false }
    ],
    // 14m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "380\n(14.12m)", isSlash: false },
      { text: "420", isSlash: false }
    ],
    // 15m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "370", isSlash: false }
    ],
    // 16m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "310", isSlash: false }
    ],
    // 17m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "230", isSlash: false }
    ],
    // 17.3m
    [
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "", isSlash: false },
      { text: "190", isSlash: false }
    ]
  ]
};

// 狀態管理
let state = loadFromStorage() || JSON.parse(JSON.stringify(DEFAULT_PRESET));
if (state.docTitle === "額定荷重表") {
  state.docTitle = "吊升荷重表";
}
if (state.notes) {
  state.notes = state.notes.replace(/\s*不含吊鉤\s*60\s*kg/gi, "").trim();
}
delete state.modelName;

// DOM 元素引用
const inputDocTitle = document.getElementById("inputDocTitle");
const inputUnit = document.getElementById("inputUnit");
const inputNotes = document.getElementById("inputNotes");
const boomHeaderSuper = document.getElementById("boomHeaderSuper");
const boomLengthsRow = document.getElementById("boomLengthsRow");
const tableBody = document.getElementById("tableBody");
const ropeRow = document.getElementById("ropeRow");

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderAll();
});

// 綁定事件監聽器
function bindEvents() {
  // 頂部輸入框
  inputDocTitle.addEventListener("input", (e) => { state.docTitle = e.target.value; saveToStorage(); });
  inputUnit.addEventListener("input", (e) => { state.unit = e.target.value; saveToStorage(); });
  inputNotes.addEventListener("input", (e) => { state.notes = e.target.value; saveToStorage(); });

  // 控制按鈕
  document.getElementById("btnAddCol").addEventListener("click", addBoomColumn);
  document.getElementById("btnRemoveCol").addEventListener("click", removeLastBoomColumn);
  document.getElementById("btnAddRow").addEventListener("click", addRadiusRow);
  document.getElementById("btnRemoveRow").addEventListener("click", removeLastRadiusRow);
  document.getElementById("btnBatchRadius").addEventListener("click", openBatchModal);

  document.getElementById("btnLoadPreset").addEventListener("click", () => {
    if (confirm("確定要重設為標準預設數據嗎？目前的修改將會被覆蓋。")) {
      state = JSON.parse(JSON.stringify(DEFAULT_PRESET));
      saveToStorage();
      renderAll();
    }
  });

  document.getElementById("btnClearData").addEventListener("click", () => {
    if (confirm("確定要清空所有荷重格內容嗎？")) {
      state.cells.forEach(row => {
        row.forEach(cell => {
          cell.text = "";
          cell.isSlash = false;
        });
      });
      saveToStorage();
      renderTableBody();
    }
  });

  // 列印按鈕
  document.getElementById("btnPrint").addEventListener("click", () => {
    window.print();
  });

  // 匯出匯入
  document.getElementById("btnExportJson").addEventListener("click", exportToJson);
  document.getElementById("fileImportJson").addEventListener("change", importFromJson);

  // 批次 Modal
  const modal = document.getElementById("batchModal");
  document.getElementById("btnCancelBatch").addEventListener("click", () => modal.close());
  document.getElementById("btnConfirmBatch").addEventListener("click", applyBatchRadius);
}

// 渲染全部視圖
function renderAll() {
  inputDocTitle.value = state.docTitle || "吊升荷重表";
  inputUnit.value = state.unit || "kg";
  inputNotes.value = state.notes || "";

  renderBoomHeaders();
  renderTableBody();
  renderRopeRow();
}

// 渲染伸臂表頭
function renderBoomHeaders() {
  const colCount = state.booms.length;
  boomHeaderSuper.colSpan = colCount;

  boomLengthsRow.innerHTML = "";
  state.booms.forEach((boom, colIdx) => {
    const th = document.createElement("th");
    th.className = "boom-th";
    th.innerHTML = `
      <input type="text" class="cell-input text-bold" value="${boom}" data-col="${colIdx}">
      <button class="th-del-btn" title="刪除此欄" data-col="${colIdx}">✕</button>
    `;

    // 編輯欄位值
    const input = th.querySelector("input");
    input.addEventListener("input", (e) => {
      state.booms[colIdx] = e.target.value;
      saveToStorage();
    });

    // 刪除此欄按鈕
    const delBtn = th.querySelector(".th-del-btn");
    delBtn.addEventListener("click", () => {
      if (state.booms.length <= 1) {
        alert("至少需保留一欄伸臂！");
        return;
      }
      deleteBoomColumn(colIdx);
    });

    boomLengthsRow.appendChild(th);
  });
}

// 渲染表格內容列
function renderTableBody() {
  tableBody.innerHTML = "";

  state.radiuses.forEach((radius, rowIdx) => {
    const tr = document.createElement("tr");

    // 左側半徑標頭
    const th = document.createElement("th");
    th.className = "radius-th";
    th.innerHTML = `
      <input type="text" class="cell-input text-bold" value="${radius}" data-row="${rowIdx}">
      <button class="th-del-btn" title="刪除此列" data-row="${rowIdx}">✕</button>
    `;

    // 編輯半徑
    const radiusInput = th.querySelector("input");
    radiusInput.addEventListener("input", (e) => {
      state.radiuses[rowIdx] = e.target.value;
      saveToStorage();
    });

    // 刪除此列按鈕
    const delBtn = th.querySelector(".th-del-btn");
    delBtn.addEventListener("click", () => {
      if (state.radiuses.length <= 1) {
        alert("至少需保留一列作業半徑！");
        return;
      }
      deleteRadiusRow(rowIdx);
    });

    tr.appendChild(th);

    // 確保每列 cell 數與 booms 一致
    if (!state.cells[rowIdx]) {
      state.cells[rowIdx] = [];
    }
    while (state.cells[rowIdx].length < state.booms.length) {
      state.cells[rowIdx].push({ text: "", isSlash: false });
    }

    // 各荷重格
    state.booms.forEach((_, colIdx) => {
      const td = document.createElement("td");
      const cellData = state.cells[rowIdx][colIdx] || { text: "", isSlash: false };

      if (cellData.isSlash) {
        td.classList.add("diagonal-slash-cell");
      }
      // 受限制（額定荷重＋吊具上限）之格與未受限制之格之間以粗線分隔（每格只畫自己的下框、右框）
      {
        const nb = (r, c) => (state.cells[r] || [])[c];
        const val = (x) => x && !x.isSlash && String(x.text || '').trim() !== '';
        const edge = (a, b) => val(a) && val(b) && !!a.cap !== !!b.cap;
        if (edge(cellData, nb(rowIdx + 1, colIdx))) td.classList.add("cap-b");
        if (edge(cellData, nb(rowIdx, colIdx + 1))) td.classList.add("cap-r");
      }

      td.innerHTML = `
        <div class="cell-wrapper">
          <div class="load-cell-content" contenteditable="true" spellcheck="false">${escapeHtml(cellData.text)}</div>
          <div class="cell-actions no-print">
            <button class="btn-mini-slash" title="切換斜線 (無效作業範圍)">${cellData.isSlash ? '清除斜線' : '斜線'}</button>
          </div>
        </div>
      `;

      const contentDiv = td.querySelector(".load-cell-content");
      const slashBtn = td.querySelector(".btn-mini-slash");

      // 內容修改
      contentDiv.addEventListener("input", () => {
        state.cells[rowIdx][colIdx].text = contentDiv.innerText.trim();
        saveToStorage();
      });

      // 雙擊格子快速切換斜線
      td.addEventListener("dblclick", (e) => {
        if (e.target.tagName !== "BUTTON") {
          toggleCellSlash(rowIdx, colIdx, td, slashBtn);
        }
      });

      // 點擊斜線按鈕切換
      slashBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleCellSlash(rowIdx, colIdx, td, slashBtn);
      });

      tr.appendChild(td);
    });

    tableBody.appendChild(tr);
  });
}

// 渲染底部鋼索掛數列
function renderRopeRow() {
  // 清空除標題外的欄位
  while (ropeRow.children.length > 1) {
    ropeRow.removeChild(ropeRow.lastChild);
  }

  // 確保 rope 陣列長度與 booms 相符
  while (state.ropes.length < state.booms.length) {
    state.ropes.push("4本掛");
  }

  state.booms.forEach((_, colIdx) => {
    const td = document.createElement("td");
    const ropeVal = state.ropes[colIdx] || "4本掛";
    td.innerHTML = `<input type="text" class="cell-input text-bold" value="${ropeVal}" data-col="${colIdx}">`;

    const input = td.querySelector("input");
    input.addEventListener("input", (e) => {
      state.ropes[colIdx] = e.target.value;
      saveToStorage();
    });

    ropeRow.appendChild(td);
  });
}

// 切換斜線狀態
function toggleCellSlash(rowIdx, colIdx, tdElement, slashBtn) {
  const current = state.cells[rowIdx][colIdx].isSlash;
  state.cells[rowIdx][colIdx].isSlash = !current;
  
  if (state.cells[rowIdx][colIdx].isSlash) {
    tdElement.classList.add("diagonal-slash-cell");
    slashBtn.textContent = "清除斜線";
  } else {
    tdElement.classList.remove("diagonal-slash-cell");
    slashBtn.textContent = "斜線";
  }
  saveToStorage();
}

// 新增伸臂長度欄
function addBoomColumn() {
  const nextLen = prompt("請輸入新增伸臂長度 (m)：", "20.75");
  if (nextLen === null || nextLen.trim() === "") return;

  state.booms.push(nextLen.trim());
  state.ropes.push("4本掛");
  
  state.cells.forEach(row => {
    row.push({ text: "", isSlash: false });
  });

  saveToStorage();
  renderAll();
}

// 刪除指定伸臂長度欄
function deleteBoomColumn(colIdx) {
  if (confirm(`確定要刪除伸臂長度「${state.booms[colIdx]}m」這整欄嗎？`)) {
    state.booms.splice(colIdx, 1);
    state.ropes.splice(colIdx, 1);
    state.cells.forEach(row => {
      row.splice(colIdx, 1);
    });
    saveToStorage();
    renderAll();
  }
}

// 刪除最後一欄伸臂
function removeLastBoomColumn() {
  if (state.booms.length <= 1) {
    alert("至少需保留一欄伸臂！");
    return;
  }
  const lastCol = state.booms[state.booms.length - 1];
  if (confirm(`確定要刪除最後一欄「${lastCol}m」嗎？`)) {
    state.booms.pop();
    state.ropes.pop();
    state.cells.forEach(row => row.pop());
    saveToStorage();
    renderAll();
  }
}

// 新增作業半徑列
function addRadiusRow() {
  const lastRadius = parseFloat(state.radiuses[state.radiuses.length - 1]) || 17;
  const nextRadius = prompt("請輸入新增作業半徑 (m)：", (lastRadius + 1).toString());
  if (nextRadius === null || nextRadius.trim() === "") return;

  state.radiuses.push(nextRadius.trim());
  const newRow = state.booms.map(() => ({ text: "", isSlash: false }));
  state.cells.push(newRow);

  saveToStorage();
  renderTableBody();
}

// 刪除指定作業半徑列
function deleteRadiusRow(rowIdx) {
  if (confirm(`確定要刪除作業半徑「${state.radiuses[rowIdx]}m」這整列嗎？`)) {
    state.radiuses.splice(rowIdx, 1);
    state.cells.splice(rowIdx, 1);
    saveToStorage();
    renderTableBody();
  }
}

// 刪除最後一列半徑
function removeLastRadiusRow() {
  if (state.radiuses.length <= 1) {
    alert("至少需保留一列作業半徑！");
    return;
  }
  const lastR = state.radiuses[state.radiuses.length - 1];
  if (confirm(`確定要刪除最後一列「${lastR}m」嗎？`)) {
    state.radiuses.pop();
    state.cells.pop();
    saveToStorage();
    renderTableBody();
  }
}

// 打開批次設定半徑視窗
function openBatchModal() {
  const modal = document.getElementById("batchModal");
  modal.showModal();
}

// 執行批次設定半徑
function applyBatchRadius() {
  const start = parseFloat(document.getElementById("modalRadiusStart").value);
  const end = parseFloat(document.getElementById("modalRadiusEnd").value);
  const step = parseFloat(document.getElementById("modalRadiusStep").value);
  const extraStr = document.getElementById("modalRadiusExtra").value.trim();

  if (isNaN(start) || isNaN(end) || isNaN(step) || step <= 0 || start > end) {
    alert("請輸入正確的數值範圍！");
    return;
  }

  const newRadiuses = [];
  for (let r = start; r <= end + 0.0001; r += step) {
    // 解決浮點數精度問題
    newRadiuses.push(Number(r.toFixed(2)).toString());
  }

  if (extraStr) {
    const extras = extraStr.split(",").map(s => s.trim()).filter(s => s.length > 0);
    extras.forEach(ext => {
      if (!newRadiuses.includes(ext)) {
        newRadiuses.push(ext);
      }
    });
    // 數值排序
    newRadiuses.sort((a, b) => parseFloat(a) - parseFloat(b));
  }

  // 建立新的 cells 對應舊有資料
  const newCells = newRadiuses.map(r => {
    const oldIdx = state.radiuses.indexOf(r);
    if (oldIdx !== -1 && state.cells[oldIdx]) {
      return state.cells[oldIdx];
    } else {
      return state.booms.map(() => ({ text: "", isSlash: false }));
    }
  });

  state.radiuses = newRadiuses;
  state.cells = newCells;

  saveToStorage();
  renderTableBody();

  document.getElementById("batchModal").close();
}

// 匯出 JSON
function exportToJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${state.docTitle || '吊升荷重表'}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// 匯入 JSON
function importFromJson(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported.booms && imported.radiuses && imported.cells) {
        state = imported;
        saveToStorage();
        renderAll();
        alert("資料匯入成功！");
      } else {
        alert("檔案格式不符合！");
      }
    } catch (err) {
      alert("解析 JSON 失敗：" + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// 儲存至 LocalStorage
function saveToStorage() {
  try {
    localStorage.setItem("crane_load_chart_data", JSON.stringify(state));
  } catch (e) {
    console.error("無法儲存至 LocalStorage", e);
  }
}

// 從 LocalStorage 載入
function loadFromStorage() {
  try {
    const data = localStorage.getItem("crane_load_chart_data");
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("無法讀取 LocalStorage", e);
    return null;
  }
}

// HTML跳脫字元防護
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
