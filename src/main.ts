import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';
import { initDisplay } from './display';

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

// キャッシュ看破タグ [v15-Live]（ネオンピンク）
const title = document.querySelector("#debug-overlay h2");
if (title) {
  title.innerHTML += ' <span style="font-size:12px; color:#ff007f; font-weight:bold;">[v15-Live]</span>';
}

function runValidation() {
  // 📺 描画エンジン（本物仕様のWasmメモリ空間内蔵）を最優先で起動！
  initDisplay("deck-screen");

  const btnHead = document.getElementById("btn-fetch-head");
  const btnTail = document.getElementById("btn-fetch-tail");
  const streamLogEl = document.getElementById("stream-log");
  
  if (!btnHead || !btnTail || !streamLogEl) return;

  const targetUrl = "/api/dummy";

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
