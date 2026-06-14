import { VirtualWasmCore } from './wasm';
import { currentGamepadState } from './input';

let activeWasmCore: VirtualWasmCore | null = null;

export function getActiveWasmCore(): VirtualWasmCore | null {
  return activeWasmCore;
}

export function initDisplay(canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const WIDTH = 400;
  const HEIGHT = 250;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const wasmCore = new VirtualWasmCore(WIDTH, HEIGHT);
  activeWasmCore = wasmCore; 
  
  const imageData = new ImageData(wasmCore.vram as any, WIDTH, HEIGHT);

  // リアルタイムテレメトリ表示用の美麗なHUDオーバーレイDOMを動的に生成
  let telemetryOverlay = document.getElementById("telemetry-overlay");
  if (!telemetryOverlay && canvas.parentElement) {
    telemetryOverlay = document.createElement("div");
    telemetryOverlay.id = "telemetry-overlay";
    telemetryOverlay.style.position = "absolute";
    telemetryOverlay.style.top = "15px";
    telemetryOverlay.style.right = "15px";
    telemetryOverlay.style.background = "rgba(10, 10, 30, 0.85)";
    telemetryOverlay.style.color = "#00ffcc";
    telemetryOverlay.style.fontFamily = "'Courier New', monospace";
    telemetryOverlay.style.padding = "8px 12px";
    telemetryOverlay.style.borderRadius = "6px";
    telemetryOverlay.style.fontSize = "11px";
    telemetryOverlay.style.border = "1px solid #00ffcc";
    telemetryOverlay.style.pointerEvents = "none";
    
    canvas.parentElement.style.position = "relative";
    canvas.parentElement.appendChild(telemetryOverlay);
  }

  function renderLoop() {
    if (!ctx) return;

    wasmCore.tick(currentGamepadState);
    ctx.putImageData(imageData, 0, 0);

    const telemetry = wasmCore.getTelemetryData();
    if (telemetryOverlay) {
      telemetryOverlay.innerHTML = `
        <span style="color: #ff007f; font-weight: bold;">📡 TELEMETRY CORE</span><br>
        MY COORD : (${telemetry.x.toFixed(1)}, ${telemetry.y.toFixed(1)})<br>
        NEAREST LIGHT : ${telemetry.distance.toFixed(2)} px
      `;
    }

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
  console.log("📺 蛍光灯距離演算レイヤー内蔵・Wasmメモリレンダラーが起動しました。");
}
