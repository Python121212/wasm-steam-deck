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

  // 📡 RISC-V CPU ステータスモニターHUD（右上絶対配置）
  let telemetryOverlay = document.getElementById("telemetry-overlay");
  if (!telemetryOverlay && canvas.parentElement) {
    telemetryOverlay = document.createElement("div");
    telemetryOverlay.id = "telemetry-overlay";
    telemetryOverlay.style.position = "absolute";
    telemetryOverlay.style.top = "15px";
    telemetryOverlay.style.right = "15px";
    telemetryOverlay.style.background = "rgba(5, 20, 5, 0.9)";
    telemetryOverlay.style.color = "#39ff14"; // ターミナルグリーン
    telemetryOverlay.style.fontFamily = "'Courier New', monospace";
    telemetryOverlay.style.padding = "8px 12px";
    telemetryOverlay.style.borderRadius = "4px";
    telemetryOverlay.style.fontSize = "10px";
    telemetryOverlay.style.border = "1px solid #39ff14";
    telemetryOverlay.style.pointerEvents = "none";
    telemetryOverlay.style.boxShadow = "0 0 10px rgba(57,255,20,0.3)";
    
    canvas.parentElement.style.position = "relative";
    canvas.parentElement.appendChild(telemetryOverlay);
  }

  // 📟 QEMU風シリアルモニター（Canvasの真下・重なりなし）
  let serialTerminal = document.getElementById("serial-terminal");
  if (!serialTerminal && canvas.parentElement) {
    serialTerminal = document.createElement("div");
    serialTerminal.id = "serial-terminal";
    serialTerminal.style.position = "absolute";
    serialTerminal.style.top = "260px"; 
    serialTerminal.style.left = "0px";
    serialTerminal.style.right = "0px";
    serialTerminal.style.height = "140px"; // ログが大量に流れるため高さを拡張
    serialTerminal.style.background = "#000000";
    serialTerminal.style.color = "#bb88ff"; 
    serialTerminal.style.fontFamily = "'Courier New', monospace";
    serialTerminal.style.padding = "8px 12px";
    serialTerminal.style.fontSize = "10px";
    serialTerminal.style.borderRadius = "4px";
    serialTerminal.style.border = "1px solid #bb88ff";
    serialTerminal.style.overflowY = "auto"; // 縦スクロール可能に
    serialTerminal.style.whiteSpace = "pre-wrap"; // 改行を正しく表示
    serialTerminal.style.boxShadow = "0 4px 12px rgba(187, 136, 255, 0.15)";
    
    canvas.parentElement.style.marginBottom = "160px";
    canvas.parentElement.appendChild(serialTerminal);
  }

  function renderLoop() {
    if (!ctx) return;

    // 仮想RISC-V CPUにクロック供給
    wasmCore.tick(currentGamepadState);
    ctx.putImageData(imageData, 0, 0);

    // 1. CPUレジスタ・命令デコーダーの可視化HUD
    const cpu = wasmCore.getTelemetryData();
    if (telemetryOverlay) {
      telemetryOverlay.innerHTML = `
        <span style="color: #fff; font-weight: bold; background:#005500; padding:1px 4px;">⚙️ RISC-V RV32I CORE</span><br>
        <span style="color:#ffcc00;">PC : 0x${cpu.pc.toString(16).toUpperCase()}</span><br>
        INSTR: <span style="color:#fff;">${cpu.mnemonic}</span><br>
        <hr style="border:0; border-top:1px solid #39ff14; margin:4px 0;">
        X1 (str) : 0x${(cpu.x1 >>> 0).toString(16).toUpperCase()}<br>
        X2 (uart): 0x${(cpu.x2 >>> 0).toString(16).toUpperCase()}<br>
        X3 (char): '${String.fromCharCode(cpu.x3 & 0xff).replace(/[\x00-\x1F\x7F]/g, '.').trim()}' (0x${(cpu.x3 & 0xff).toString(16)})
      `;
    }

    // 2. 📟 仮想UART MMIOレジスタから生ブートログを吸い出して印字（自動最下部スクロール）
    const uartLog = wasmCore.readVirtualUart();
    if (serialTerminal && uartLog) {
      const isAtBottom = serialTerminal.scrollHeight - serialTerminal.clientHeight <= serialTerminal.scrollTop + 20;
      serialTerminal.textContent = `📟 QEMU_UART_MONITOR:\n${uartLog}`;
      if (isAtBottom) {
        serialTerminal.scrollTop = serialTerminal.scrollHeight;
      }
    }

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
  console.log("📺 RISC-Vアーキテクチャ対応のリアルタイム・コアモニターがオンラインになりました。");
}
