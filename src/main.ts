import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';

// エラービジュアライザー（継続）
window.addEventListener('error', (event) => {
  const overlay = document.getElementById("debug-overlay");
  if (overlay) overlay.innerHTML += `<div style="color: #ff3366; margin-top: 5px;">🚨: ${event.message}</div>`;
});

async function runValidation() {
  const sabEl = document.getElementById("status-sab")!;
  const opfsEl = document.getElementById("status-opfs")!;
  const gamepadEl = document.getElementById("status-gamepad")!;
  const diskSizeEl = document.getElementById("disk-size")!;
  const streamLogEl = document.getElementById("stream-log")!;
  
  const btnHead = document.getElementById("btn-fetch-head")!;
  const btnTail = document.getElementById("btn-fetch-tail")!;

  // 1. 基本チェック
  if (typeof SharedArrayBuffer !== "undefined") {
    sabEl.textContent = "有効"; sabEl.className = "ok";
  } else {
    sabEl.textContent = "無効"; sabEl.className = "ng";
  }

  const opfsSuccess = await testOPFS();
  opfsEl.textContent = opfsSuccess ? "成功" : "失敗";
  opfsEl.className = opfsSuccess ? "ok" : "ng";

  initGamepad((msg) => { gamepadEl.textContent = msg; });

  // 🔄 現在のディスクサイズを画面に表示
  const updateDiskSizeDisplay = async () => {
    const size = await getVirtualFileSize();
    diskSizeEl.textContent = size.toLocaleString();
  };
  await updateDiskSizeDisplay();

  // 🎯 実験用ターゲットURL：自分自身のJSファイルをダミーデータとして部分取得してみる
  const targetUrl = "./src/main.ts"; 

  // ① 0MB目（ファイルの先頭）から1024バイト取得して、OPFSの「0」の位置に書き込む
  btnHead.addEventListener("click", async () => {
    streamLogEl.textContent = "0MB目をフェッチ中...";
    const res = await streamToOPFS(targetUrl, 0, 1024);
    streamLogEl.textContent = res;
    await updateDiskSizeDisplay();
  });

  // ② ファイルの遥か彼方「10,000,000バイト目（約10MB先）」に、1024バイトだけを書き込む！
  btnTail.addEventListener("click", async () => {
    streamLogEl.textContent = "10MB目をフェッチ中...";
    // ➔ 途中の1MB〜9MBのデータは一切ダウンロードせず、一っ飛びに10MB目に書き込む
    const res = await streamToOPFS(targetUrl, 10000000, 1024);
    streamLogEl.textContent = res;
    await updateDiskSizeDisplay();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runValidation);
} else {
  runValidation();
}
