import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';

// 🚨 【超重要】裏で起きた非同期エラー（Fetch失敗やOPFSエラー）を絶対に逃さず画面に出す設定
window.addEventListener('unhandledrejection', (event) => {
  const logEl = document.getElementById("stream-log");
  if (logEl) {
    logEl.innerHTML = `<span style="color: #ff3366; font-weight:bold;">🚨 非同期エラー発生: ${event.reason?.message || event.reason}</span>`;
  }
});

// 通常のエラーも継続監視
window.addEventListener('error', (event) => {
  const logEl = document.getElementById("stream-log");
  if (logEl) logEl.innerHTML = `<span style="color: #ff3366;">🚨 エラー: ${event.message}</span>`;
});

// キャッシュ看破タグ [v5-Live]
const title = document.querySelector("#debug-overlay h2");
if (title) {
  title.innerHTML += ' <span style="font-size:12px; color:#ff00ff; font-weight:bold;">[v5-Live]</span>';
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

  // ターゲットURL
  const targetUrl = "/dummy_game.bin";

  // ボタンが押されたら「即座に」文字を変えて、タップが成功したか視覚化する
  (btnHead as HTMLButtonElement).onclick = async () => {
    streamLogEl.textContent = "📱 タップ検知！0MBフェッチ開始...";
    streamLogEl.style.color = "#00ffcc";
    
    const res = await streamToOPFS(targetUrl, 0, 1024);
    streamLogEl.textContent = res;
    await updateDiskSizeDisplay();
  };

  (btnTail as HTMLButtonElement).onclick = async () => {
    streamLogEl.textContent = "📱 タップ検知！10MBフェッチ開始...";
    streamLogEl.style.color = "#00ffcc";
    
    const res = await streamToOPFS(targetUrl, 10000000, 1024);
    streamLogEl.textContent = res;
    await updateDiskSizeDisplay();
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runValidation);
} else {
  runValidation();
}
