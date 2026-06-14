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

  // 📡 リアルタイムテレメトリHUD（右上絶対配置）
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

  // 📟 【レイアウト改善】QEMU風シリアルモニターをCanvasの真下（外側）へ完全パージ！
  let serialTerminal = document.getElementById("serial-terminal");
  if (!serialTerminal && canvas.parentElement) {
    serialTerminal = document.createElement("div");
    serialTerminal.id = "serial-terminal";
    serialTerminal.style.position = "absolute";
    serialTerminal.style.top = "260px"; // 👈 Canvas(250px)の下側に完全に押し出し、重なりを排除！
    serialTerminal.style.left = "0px";
    serialTerminal.style.right = "0px";
    serialTerminal.style.background = "rgba(5, 5, 10, 0.9)";
    serialTerminal.style.color = "#bb88ff"; // シリアルネオンパープル
    serialTerminal.style.fontFamily = "'Courier New', monospace";
    serialTerminal.style.padding = "6px 12px";
    serialTerminal.style.fontSize = "10px";
    serialTerminal.style.borderRadius = "4px";
    serialTerminal.style.border = "1px solid #bb88ff";
    serialTerminal.style.pointerEvents = "none";
    serialTerminal.style.whiteSpace = "nowrap";
    serialTerminal.style.overflow = "hidden";
    serialTerminal.style.textOverflow = "ellipsis";
    serialTerminal.style.boxShadow = "0 4px 10px rgba(187, 136, 255, 0.2)";
    
    // 親コンテナの下部に余裕を持たせる
    canvas.parentElement.style.marginBottom = "45px";
    canvas.parentElement.appendChild(serialTerminal);
  }

  function renderLoop() {
    if (!ctx) return;

    // 仮想ハードウェアのクロック駆動
    wasmCore.tick(currentGamepadState);
    ctx.putImageData(imageData, 0, 0);

    // 1. HUDテレメトリ更新
    const telemetry = wasmCore.getTelemetryData();
    if (telemetryOverlay) {
      telemetryOverlay.innerHTML = `
        <span style="color: #ff007f; font-weight: bold;">📡 TELEMETRY CORE</span><br>
        MY COORD : (${telemetry.x.toFixed(1)}, ${telemetry.y.toFixed(1)})<br>
        NEAREST LIGHT : ${telemetry.distance.toFixed(2)} px
      `;
    }

    // 2. 📟 Wasm生メモリのUART空間からデータを直接デコードして外側コンソールに印字
    const uartLog = wasmCore.readVirtualUart();
    if (serialTerminal && uartLog) {
      serialTerminal.textContent = `📟 QEMU_UART_MONITOR: ${uartLog}`;
    }

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
  console.log("📺 画面被りを解消したQEMUシリアルバス・モニタリングシステムが再起動しました。");
}
