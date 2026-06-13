export function initGamepad(onUpdate: (msg: string) => void) {
  window.addEventListener("gamepadconnected", (e) => {
    console.log("Gamepad Connected:", e.gamepad);
    requestAnimationFrame(updateLoop);
  });

  window.addEventListener("gamepaddisconnected", () => {
    onUpdate("未接続");
  });

  function updateLoop() {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0]; // 最初のコントローラー

    if (gp) {
      // 例: Aボタン、Bボタン、左スティックの値をデバッグ表示
      const aBtn = gp.buttons[0].pressed ? "[A]" : "";
      const bBtn = gp.buttons[1].pressed ? "[B]" : "";
      const axisX = gp.axes[0].toFixed(2);
      const axisY = gp.axes[1].toFixed(2);
      
      onUpdate(`🎮 ${gp.id.slice(0, 15)}... | ボタン: ${aBtn}${bBtn} | スティック: X:${axisX} Y:${axisY}`);
      requestAnimationFrame(updateLoop);
    }
  }
}

