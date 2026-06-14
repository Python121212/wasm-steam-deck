import { VirtualWasmCore } from './wasm';
import { currentGamepadState } from './input';

export function initDisplay(canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const WIDTH = 400;
  const HEIGHT = 250;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // 🚀 本尊：Wasmゲームコアのインスタンス化！
  const wasmCore = new VirtualWasmCore(WIDTH, HEIGHT);
  
  // Canvas転送用のラッパーオブジェクト（Wasmのメモリ空間を直接ラップする）
  const imageData = new ImageData(wasmCore.memory, WIDTH, HEIGHT);

  function renderLoop() {
    if (!ctx) return;

    // 1. Wasmコアに最新のコントローラー入力を叩き込んで、内部メモリ(VRAM)を更新させる
    wasmCore.tick(currentGamepadState);

    // 2. 更新されたWasmのメモリデータを、そのまま一撃でCanvasに超高速転送！
    ctx.putImageData(imageData, 0, 0);

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
  console.log("📺 Wasmメモリ直結型・高速レンダリングループが起動しました。");
}
