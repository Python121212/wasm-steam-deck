import './style.css';
import { testOPFS } from './opfs';
import { initGamepad } from './input';

// 📱 スマホデバッグ用：もしエラーが起きたら画面に赤文字で強制表示する
window.addEventListener('error', (event) => {
  const overlay = document.getElementById("debug-overlay");
  if (overlay) {
    overlay.innerHTML += `<div style="color: #ff3366; margin-top: 10px; font-weight: bold; background: rgba(0,0,0,0.8); padding: 5px;">🚨 エラー: ${event.message}</div>`;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const overlay = document.getElementById("debug-overlay");
  if (overlay) {
    overlay.innerHTML += `<div style="color: #ff3366; margin-top: 10px; font-weight: bold; background: rgba(0,0,0,0.8); padding: 5px;">🚨 非同期エラー: ${event.reason}</div>`;
  }
});

async function runValidation() {
  const sabEl = document.getElementById("status-sab");
  const opfsEl = document.getElementById("status-opfs");
  const gamepadEl = document.getElementById("status-gamepad");
  const screen = document.getElementById("deck-screen");

  // HTMLの要素がまだ生成されていなければ、0.1秒待って再挑戦（タイミング問題を完全解決）
  if (!sabEl || !opfsEl || !gamepadEl || !screen) {
    setTimeout(runValidation, 100);
    return;
  }

  // 1. クロスオリジン隔離 (SharedArrayBuffer) のチェック
  if (typeof SharedArrayBuffer !== "undefined") {
    sabEl.textContent = "有効（Wasmマルチスレッド解放！）";
    sabEl.className = "ok";
  } else {
    sabEl.textContent = "無効（vercel.jsonの設定、またはHTTPS接続が必要です）";
    sabEl.className = "ng";
  }

  // 2. OPFSのストレージテスト
  const opfsSuccess = await testOPFS();
  if (opfsSuccess) {
    opfsEl.textContent = "成功（SSD並みのI/Oが可能です）";
    opfsEl.className = "ok";
  } else {
    opfsEl.textContent = "失敗（ブラウザが対応していません）";
    opfsEl.className = "ng";
  }

  // 3. コントローラーの初期化
  initGamepad((msg) => {
    gamepadEl.textContent = msg;
    gamepadEl.className = "ok";
  });

  // 4. バーチャルパンタグラフUX：GPUズーム ＆ ドラッグテスト
  let scale = 1;
  let translateX = -50;
  let translateY = -50;
  let isDragging = false;

  window.addEventListener("wheel", (e) => {
    e.preventDefault();
    scale += e.deltaY * -0.001;
    scale = Math.min(Math.max(0.5, scale), 3);
    (screen as HTMLElement).style.transform = `translate(${translateX}%, ${translateY}%) scale(${scale})`;
  }, { passive: false });

  screen.addEventListener("mousedown", () => isDragging = true);
  window.addEventListener("mouseup", () => isDragging = false);
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    translateX += (e.movementX / window.innerWidth) * 100;
    translateY += (e.movementY / window.innerHeight) * 100;
    (screen as HTMLElement).style.transform = `translate(${translateX}%, ${translateY}%) scale(${scale})`;
  });
}

// DOMの読み込み状態を自動判別して安全に起動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runValidation);
} else {
  runValidation();
}
