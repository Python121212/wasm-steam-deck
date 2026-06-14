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

// キャッシュ看破タグ [v16-Live]（サイバーライム）
const title = document.querySelector("#debug-overlay h2");
if (title) {
  title.innerHTML += ' <span style="font-size:12px; color:#39ff14; font-weight:bold;">[v16-Live]</span>';
}

function runValidation() {
  // 📺 描画エンジン起動
  initDisplay("deck-screen");

  const btnHead = document.getElementById("btn-fetch-head");
  const btnTail = document.getElementById("btn-fetch-tail");
  const streamLogEl = document.getElementById("stream-log");
  
  if (!btnHead || !btnTail || !streamLogEl) return;

  const targetUrl = "/api/dummy";

  // 💾 【伏線回収】ユーザー専用：現在の座標と最寄り蛍光灯への距離をOPFSへ永続記録するサイバーボタンを動的インジェクション！
  const btnContainer = btnHead.parentElement;
  if (btnContainer) {
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
      e.stopPropagation();
      e.preventDefault();
      
      printLog("💾 OPFSへのテレメトリデータ書き込みを開始...", "#00ffcc");
      try {
        const activeCore = getActiveWasmCore();
        if (!activeCore) throw new Error("WasmCoreが初期化されていません");

        // 1. Wasmメモリの共有レジスタ空間から、現在の生の「座標」と「最短距離」を瞬時に抽出
        const telemetry = activeCore.getTelemetryData();
        
        // 2. 高速ファイルシステム（OPFS）のハンドルを取得し、ログファイルを開く
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle("light_telemetry.txt", { create: true });
        const writable = await fileHandle.createWritable({ keepExistingData: true });
        
        // 3. ファイルの現在の限界末尾にシーク（追記モード）
        const file = await fileHandle.getFile();
        await writable.seek(file.size);
        
        // 4. 高精度なログ文字列を成形してディスクへ直接フラッシュ書き込み
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
        const logLine = `[${timestamp}] X:${telemetry.x.toFixed(2)} Y:${telemetry.y.toFixed(2)} Dist:${telemetry.distance.toFixed(2)}\n`;
        
        await writable.write(logLine);
        await writable.close();
        
        printLog(`✅ OPFS書き込み成功! [${timestamp}] 距離:${telemetry.distance.toFixed(1)}px`, "#39ff14");
        
        // 仮想ディスクサイズ表示を即時更新
        const size = await getVirtualFileSize();
        const diskSizeEl = document.getElementById("disk-size");
        if (diskSizeEl) diskSizeEl.textContent = size.toLocaleString();

      } catch (err: any) {
        printLog(`❌ 保存失敗: ${err.message || err}`, "#ff3366");
      }
    }, { passive: false });
  }

  const executeFetch = async (e: Event, offset: number) => {
    e.stopPropagation();
    e.preventDefault();

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
