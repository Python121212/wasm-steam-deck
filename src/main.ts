import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';
import { initDisplay, getActiveWasmCore } from './display';

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

// キャッシュ看破タグ [v18-Live]（サイバーパープル）
const title = document.querySelector("#debug-overlay h2");
if (title) {
  title.innerHTML += ' <span style="font-size:12px; color:#bb88ff; font-weight:bold;">[v18-Live]</span>';
}

function runValidation() {
  // 📺 描画・仮想UART通信統合ディスプレイの起動
  initDisplay("deck-screen");

  const btnHead = document.getElementById("btn-fetch-head");
  const btnTail = document.getElementById("btn-fetch-tail");
  const streamLogEl = document.getElementById("stream-log");
  
  if (!btnHead || !btnTail || !streamLogEl) return;

  const targetUrl = "/api/dummy";

  const btnContainer = btnHead.parentElement;
  if (btnContainer) {
    // 💾 【セーブボタン】座標・蛍光灯距離をOPFSに記録
    const btnSave = document.createElement("button");
    btnSave.id = "btn-save-telemetry";
    btnSave.textContent = "💾 座標・蛍光灯距離をOPFSに記録";
    btnSave.style.background = "linear-gradient(135deg, #00ffcc, #0077ff)";
    btnSave.style.color = "#000";
    btnSave.style.border = "none";
    btnSave.style.padding = "6px 12px";
    btnSave.style.margin = "4px";
    btnSave.style.borderRadius = "4px";
    btnSave.style.cursor = "pointer";
    btnSave.style.fontWeight = "bold";
    btnSave.style.fontSize = "11px";
    btnSave.style.boxShadow = "0 0 10px rgba(0,255,204,0.5)";
    btnContainer.appendChild(btnSave);
    
    btnSave.addEventListener("pointerdown", async (e) => {
      e.stopPropagation(); e.preventDefault();
      printLog("💾 OPFSへのテレメトリデータ書き込みを開始...", "#00ffcc");
      try {
        const activeCore = getActiveWasmCore();
        if (!activeCore) throw new Error("WasmCoreが初期化されていません");

        const telemetry = activeCore.getTelemetryData();
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle("light_telemetry.txt", { create: true });
        const writable = await fileHandle.createWritable({ keepExistingData: true });
        const file = await fileHandle.getFile();
        await writable.seek(file.size);
        
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
        const logLine = `[${timestamp}] X:${telemetry.x.toFixed(2)} Y:${telemetry.y.toFixed(2)} Dist:${telemetry.distance.toFixed(2)}\n`;
        
        await writable.write(logLine);
        await writable.close();
        
        printLog(`✅ OPFS書き込み成功! [${timestamp}] 距離:${telemetry.distance.toFixed(1)}px`, "#39ff14");
        
        const size = await getVirtualFileSize();
        const diskSizeEl = document.getElementById("disk-size");
        if (diskSizeEl) diskSizeEl.textContent = size.toLocaleString();
      } catch (err: any) {
        printLog(`❌ 保存失敗: ${err.message || err}`, "#ff3366");
      }
    }, { passive: false });

    // 📂 【ロードボタン】タイムワープ復元
    const btnLoad = document.createElement("button");
    btnLoad.id = "btn-load-telemetry";
    btnLoad.textContent = "📂 OPFSから最新の記録をロードして復元";
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
      printLog("📂 OPFSのログを解析中...", "#ffaa00");

      try {
        const activeCore = getActiveWasmCore();
        if (!activeCore) throw new Error("WasmCoreが見つかりません");

        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle("light_telemetry.txt", { create: true });
        const file = await fileHandle.getFile();
        const text = await file.text();

        if (!text.trim()) {
          throw new Error("保存されたログデータがまだ空っぽです。先にセーブしてください！");
        }

        const lines = text.trim().split("\n");
        const lastLine = lines[lines.length - 1];

        const matchX = lastLine.match(/X:([\d.]+)/);
        const matchY = lastLine.match(/Y:([\d.]+)/);

        if (!matchX || !matchY) {
          throw new Error("ログのデータ形式が不正です");
        }

        const savedX = parseFloat(matchX[1]);
        const savedY = parseFloat(matchY[1]);

        activeCore.injectPlayerPosition(savedX, savedY);

        printLog(`⚡ タイムワープ成功! 過去の位置 (${savedX.toFixed(1)}, ${savedY.toFixed(1)}) をWasmメモリに復元しました。`, "#39ff14");
      } catch (err: any) {
        printLog(`❌ ロード失敗: ${err.message || err}`, "#ff3366");
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

  // ステータスチェック系
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runValidation);
} else {
  runValidation();
}
