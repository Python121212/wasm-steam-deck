import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';
import { initDisplay, getActiveWasmCore } from './display';

function runValidation() {
  initDisplay("deck-screen");
  
  const logTerminalEl = document.getElementById("stream-log");
  const activeCore = getActiveWasmCore();

  // ログポーリングループ
  const poll = () => {
    if (activeCore) {
      // 停止していたらPCをリセットしてログを強制リフレッシュ
      if (activeCore.getTelemetryData().pc === 0x80000020) {
        activeCore.injectCpuState(0x80000000, new Array(32).fill(0));
      }

      const uartOutput = activeCore.readVirtualUart();
      if (uartOutput && logTerminalEl) {
        logTerminalEl.innerText = uartOutput;
        // 自動スクロール
        const parent = logTerminalEl.parentElement;
        if (parent) parent.scrollTop = parent.scrollHeight;
      }
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

document.addEventListener("DOMContentLoaded", runValidation);
