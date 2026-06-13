import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';

// 🔥 キャッシュ看破：最新のJSが動いた瞬間、タイトルの横に緑色で [v3-Live] と刻まれます
const title = document.querySelector("#debug-overlay h2");
if (title) {
  title.innerHTML += ' <span style="font-size:12px; color:#00ffcc; font-weight:bold;">[v3-Live]</span>';
}

async function runValidation() {
  const sabEl = document.getElementById("status-sab")!;
  const opfsEl = document.getElementById("status-opfs")!;
  const gamepadEl = document.getElementById("status-gamepad")!;
  const diskSizeEl = document.getElementById("disk-size")!;
  const streamLogEl = document.getElementById("stream-log")!;
  
  const btnHead = document.getElementById("btn-fetch-head")!;
  const btnTail = document.getElementById("btn-fetch-tail")!;

  if (typeof SharedArrayBuffer !== "undefined") {
    sabEl.textContent = "有効"; sabEl.className = "ok";
  } else {
    sabEl.textContent = "無効"; sabEl.className = "ng";
  }

  const opfsSuccess = await testOPFS();
  opfsEl.textContent = opfsSuccess ? "成功" : "失敗";
  opfsEl.className = opfsSuccess ? "ok" : "ng";

  initGamepad((msg) => { gamepadEl.textContent = msg; });

  const updateDiskSizeDisplay = async () => {
    const size = await getVirtualFileSize();
    diskSizeEl.textContent = size.toLocaleString();
  };
  await updateDiskSizeDisplay();

  // 🎯 100%絶対に存在する「今のページ自体」をダミーデータとしてストリーム実験！
  const targetUrl = window.location.href;

  // 最も確実にクリックを奪取するインライン上書き方式
  (btnHead as HTMLButtonElement).onclick = async () => {
    streamLogEl.textContent = "⏳ 0MB目をフェッチ中...";
    streamLogEl.style.color = "#00ffcc";
    const res = await streamToOPFS(targetUrl, 0, 1024);
    streamLogEl.textContent = res;
    streamLogEl.style.color = res.includes("失敗") ? "#ff3366" : "#aaa";
    await updateDiskSizeDisplay();
  };

  (btnTail as HTMLButtonElement).onclick = async () => {
    streamLogEl.textContent = "⏳ 10MB目をフェッチ中...";
    streamLogEl.style.color = "#00ffcc";
    const res = await streamToOPFS(targetUrl, 10000000, 1024);
    streamLogEl.textContent = res;
    streamLogEl.style.color = res.includes("失敗") ? "#ff3366" : "#aaa";
    await updateDiskSizeDisplay();
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runValidation);
} else {
  runValidation();
}
