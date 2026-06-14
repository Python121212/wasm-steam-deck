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

  // 🚀 本格化：本物のWebAssembly.Memory構造を内蔵したゲームコアをインスタンス化！
  const wasmCore = new VirtualWasmCore(WIDTH, HEIGHT);
  
  // Wasmのメモリ空間から切り出されたVRAM配列を直接ラップし、Canvas転送用にバインド
  const imageData = new ImageData(wasmCore.vram as any, WIDTH, HEIGHT);

  function renderLoop() {
    if (!ctx) return;

    // 1. 本物のWasm共有メモリ上でインプット＆ゲームロジック（仮想CPU）を毎フレームぶん回す
    wasmCore.tick(currentGamepadState);

    // 2. Wasmメモリ内のVRAM領域の最新ピクセルデータを、一撃でCanvasへ超高速転送！
    ctx.putImageData(imageData, 0, 0);

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
  console.log("📺 WebAssembly共有メモリ直結・高速レンダリングループが起動しました。");
}
