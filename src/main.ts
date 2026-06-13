import './style.css';
import { testOPFS } from './opfs';
import { initGamepad } from './input';

// 起動時に即実行する関数
async function runValidation() {
  const sabEl = document.getElementById("status-sab")!;
  const opfsEl = document.getElementById("status-opfs")!;
  const gamepadEl = document.getElementById("status-gamepad")!;
  const screen = document.getElementById("deck-screen") as HTMLCanvasElement;

  // 1. クロスオリジン隔離 (SharedArrayBuffer) のチェック
  if (typeof SharedArrayBuffer !== "undefined") {
    sabEl.textContent = "有効（Wasmマルチスレッド解放！）";
    sabEl.className = "ok";
  } else {
    sabEl.textContent = "無効（HTTPS接続、またはvercel.jsonの確認が必要です）";
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
    updateTransform();
  }, { passive: false });

  screen.addEventListener("mousedown", () => isDragging = true);
  window.addEventListener("mouseup", () => isDragging = false);
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    translateX += (e.movementX / window.innerWidth) * 100;
    translateY += (e.movementY / window.innerHeight) * 100;
    updateTransform();
  });

  function updateTransform() {
    screen.style.transform = `translate(${translateX}%, ${translateY}%) scale(${scale})`;
  }
}

// 実行！
runValidation();
