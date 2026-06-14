import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';
import { initDisplay, getActiveWasmCore } from './display';

// 🚨 【最強の対策】もしHTML側に stream-log がなければ、画面下の黒い領域（canvas等）の直後に強制生成する
function ensureTerminalElement(): HTMLElement {
  let logEl = document.getElementById("stream-log");
  if (!logEl) {
    // 既存の黒いコンソールエリアになりそうな要素、もしくはcanvasを探す
    const container = document.querySelector('.console-container') || document.body;
    logEl = document.createElement("div");
    logEl.id = "stream-log";
    container.appendChild(logEl);
  }
  
  // 確実に視覚化するための強制スタイル適用
  logEl.style.display = "block";
  logEl.style.position = "absolute";
  logEl.style.left = "5px";
  logEl.style.bottom = "5px";
  logEl.style.width = "calc(100% - 10px)";
  logEl.style.height = "240px"; // スクリーンショットの黒い帯の高さに合わせる
  logEl.style.backgroundColor = "#000000";
  logEl.style.color = "#39ff14"; // ネオンマトリックスグリーン
  logEl.style.fontFamily = "'Courier New', Courier, monospace";
  logEl.style.fontSize = "13px";
  logEl.style.lineHeight = "1.5";
  logEl.style.overflowY = "auto";
  logEl.style.whiteSpace = "pre-wrap";
  logEl.style.padding = "10px";
  logEl.style.boxSizing = "border-box";
  logEl.style.zIndex = "9999";
  logEl.style.borderTop = "2px solid #222";
  
  return logEl;
}

const printLog = (msg: string, color = "#aaa") => {
  const logEl = document.getElementById("stream-log");
  if (logEl) {
    logEl.innerHTML = msg;
    logEl.style.color = color;
  }
};

window.addEventListener('unhandledrejection', (event) => {
  printLog(`🚨 非同期エラー: ${event.reason?.message || event.reason}`, "#ff3366");
});
window.addEventListener('error', (event) => {
  printLog(`🚨 システムエラー: ${event.message}`, "#ff3366");
});

const title = document.querySelector("#debug-overlay h2");
if (title) {
  title.innerHTML += ' <span style="font-size:12px; color:#39ff14; font-weight:bold;">[v20-Fix]</span>';
}

function runValidation() {
  // 画面コンテキストの初期化
  initDisplay("deck-screen");
  
  // ターミナル要素を確実に画面上に生成・確保する
  const logTerminalEl = ensureTerminalElement();

  const btnHead = document.getElementById("btn-fetch-head");
  const btnTail = document.getElementById("btn-fetch-tail");
  
  if (!btnHead || !btnTail) return;

  const targetUrl = "/api/dummy";

  const btnContainer = btnHead.parentElement;
  if (btnContainer) {
    const btnSave = document.createElement("button");
    btnSave.id = "btn-save-telemetry";
    btnSave.textContent = "💾 CPUステートをOPFSにスナップショット保存";
    btnSave.style.background = "linear-gradient(135deg, #39ff14, #00aa00)";
    btnSave.style.color = "#000";
    btnSave.style.border = "none";
    btnSave.style.padding = "6px 12px";
    btnSave.style.margin = "4px";
    btnSave.style.borderRadius = "4px";
    btnSave.style.cursor = "pointer";
    btnSave.style.fontWeight = "bold";
    btnSave.style.fontSize = "11px";
    btnSave.style.boxShadow = "0 0 10px rgba(57,255,20,0.5)";
    btnContainer.appendChild(btnSave);
    
    btnSave.addEventListener("pointerdown", async (e) => {
      e.stopPropagation(); e.preventDefault();
      printLog("💾 仮想RISC-V CPUのレジスタダンプをOPFSへ永続化中...", "#39ff14");
      try {
        const activeCore = getActiveWasmCore();
        if (!activeCore) throw new Error("WasmCoreが初期化されていません");

        const cpu = activeCore.getTelemetryData();
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle("cpu_state.json", { create: true });
        const writable = await fileHandle.createWritable();
        
        const statePayload = {
          pc: cpu.pc,
          registers: cpu.allRegs,
          timestamp: new Date().toISOString()
        };
        
        await writable.write(JSON.stringify(statePayload));
        await writable.close();
        
        printLog(`✅ ステートセーブ完了! PC: 0x${cpu.pc.toString(16).toUpperCase()} を保持しました。`, "#39ff14");
        
        const size = await getVirtualFileSize();
        const diskSizeEl = document.getElementById("disk-size");
        if (diskSizeEl) diskSizeEl.textContent = size.toLocaleString();
      } catch (err: any) {
        printLog(`❌ スナップショット保存失敗: ${err.message || err}`, "#ff3366");
      }
    }, { passive: false });

    const btnLoad = document.createElement("button");
    btnLoad.id = "btn-load-telemetry";
    btnLoad.textContent = "📂 OPFSからCPUステートを復元（コールドリブート）";
    btnLoad.style.background = "linear-gradient(135deg, #ffaa00, #ff5500)";
    btnLoad.style.color = "#fff";
    btnLoad.style.border = "none";
    btnLoad.style.padding = "6px 12px";
    btnLoad.style.margin = "4px";
    btnLoad.style.borderRadius = "4px";
    btnLoad.style.cursor = "pointer";
    btnLoad.style.fontWeight = "bold";
    btnLoad.style.fontSize = "11px";
    btnLoad.style.boxShadow = "0 0 10px rgba(255,170,0,0.5)";
    btnContainer.appendChild(btnLoad);

    btnLoad.addEventListener("pointerdown", async (e) => {
      e.stopPropagation(); e.preventDefault();
      printLog("📂 OPFSからレジスタファイルを展開中...", "#ffaa00");

      try {
        const activeCore = getActiveWasmCore();
        if (!activeCore) throw new Error("WasmCoreが見つかりません");

        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle("cpu_state.json", { create: true });
        const file = await fileHandle.getFile();
        const text = await file.text();

        if (!text.trim()) {
          throw new Error("スナップショットファイルが空です。先にセーブを行ってください！");
        }

        const state = JSON.parse(text);
        activeCore.injectCpuState(state.pc, state.registers);

        printLog(`⚡ ステートロード成功! 実行アドレス 0x${state.pc.toString(16).toUpperCase()} からCPUコアが復職しました。`, "#39ff14");
      } catch (err: any) {
        printLog(`❌ ステート復元失敗: ${err.message || err}`, "#ff3366");
      }
    }, { passive: false });
  }

  const executeFetch = async (e: Event, offset: number) => {
    e.stopPropagation(); e.preventDefault();
    const label = offset === 0 ? "0MB" : "10MB";
    printLog(`📱 [${label}] タップ検知！API経由ストリーム開始...`, "#00ffcc");

    try {
      const res = await streamToOPFS(targetUrl, offset, 1024);
      printLog(res, res.includes("失敗") ? "#ff3366" : "#aaa");
    } catch (err: any) {
      printLog(`❌ フェッチエラー: ${err.message || err}`, "#ff3366");
    }

    getVirtualFileSize().then(size => {
      const el = document.getElementById("disk-size");
      if (el) el.textContent = size.toLocaleString();
    }).catch(() => {});
  };

  btnHead.addEventListener("pointerdown", (e) => executeFetch(e, 0), { passive: false });
  btnTail.addEventListener("pointerdown", (e) => executeFetch(e, 10000000), { passive: false });

  const sabEl = document.getElementById("status-sab")!;
  if (typeof SharedArrayBuffer !== "undefined") {
    sabEl.textContent = "有効"; sabEl.className = "ok";
  } else {
    sabEl.textContent = "無効"; sabEl.className = "ng";
  }

  const gamepadEl = document.getElementById("status-gamepad")!;
  initGamepad((msg) => { gamepadEl.textContent = msg; });

  const opfsEl = document.getElementById("status-opfs")!;
  const diskSizeEl = document.getElementById("disk-size")!;

  setTimeout(async () => {
    try {
      const opfsSuccess = await testOPFS();
      opfsEl.textContent = opfsSuccess ? "成功" : "失敗";
      opfsEl.className = opfsSuccess ? "ok" : "ng";
      
      const size = await getVirtualFileSize();
      diskSizeEl.textContent = size.toLocaleString();
    } catch (e: any) {
      opfsEl.textContent = "エラー停止";
      opfsEl.className = "ng";
    }
  }, 50);

  // 🐧 仮想UARTリアルタイム描画ループ（絶対出現版）
  const pollUartLog = () => {
    const activeCore = getActiveWasmCore();
    if (activeCore) {
      // CPUが最後まで走りきって停止していたら、PCをブート開始位置へ自動リマウント
      const telemetry = activeCore.getTelemetryData();
      if (telemetry.pc === 0x80000020) {
        activeCore.injectCpuState(0x80000000, new Array(32).fill(0));
      }

      const uartOutput = activeCore.readVirtualUart();
      if (uartOutput) {
        logTerminalEl.textContent = uartOutput;
        logTerminalEl.scrollTop = logTerminalEl.scrollHeight;
      }
    }
    requestAnimationFrame(pollUartLog);
  };
  requestAnimationFrame(pollUartLog);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runValidation);
} else {
  runValidation();
}
