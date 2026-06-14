// 🎮 Wasmコアがいつでも覗き見にこれる、グローバルな最新入力レジスタ
export const currentGamepadState = {
  buttons: [] as string[],
  axes: [] as number[]
};

export function initGamepad(updateStatus: (msg: string) => void) {
  let gamepadIndex: number | null = null;
  let animationFrameId: number | null = null;

  window.addEventListener("gamepadconnected", (e) => {
    gamepadIndex = e.gamepad.index;
    triggerLoop();
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    if (gamepadIndex === e.gamepad.index) {
      gamepadIndex = null;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      currentGamepadState.buttons = [];
      currentGamepadState.axes = [];
      updateStatus("❌ 未接続");
    }
  });

  function triggerLoop() {
    function checkInput() {
      if (gamepadIndex === null) return;
      
      const gamepads = navigator.getGamepads();
      const gp = gamepads[gamepadIndex];

      if (!gp) {
        animationFrameId = requestAnimationFrame(checkInput);
        return;
      }

      // レジスタをクリアして最新状態を格納
      const pressedButtons: string[] = [];
      gp.buttons.forEach((btn, idx) => {
        if (btn.pressed) {
          if (idx === 0) pressedButtons.push("A");
          else if (idx === 1) pressedButtons.push("B");
          else if (idx === 2) pressedButtons.push("X");
          else if (idx === 3) pressedButtons.push("Y");
          else pressedButtons.push(`B${idx}`);
        }
      });

      // スティックの値をそのまま配列にコピー
      currentGamepadState.buttons = pressedButtons;
      currentGamepadState.axes = [...gp.axes];

      // 画面表示用の文字列生成
      const activeAxes: string[] = [];
      gp.axes.forEach((axis, idx) => {
        if (Math.abs(axis) > 0.15) {
          const dir = axis > 0 ? "+" : "";
          if (idx === 0) activeAxes.push(`LX:${dir}${axis.toFixed(1)}`);
          if (idx === 1) activeAxes.push(`LY:${dir}${axis.toFixed(1)}`);
        }
      });

      let statusText = `🟢 接続中: ${gp.id.slice(0, 12)}...`;
      if (pressedButtons.length > 0 || activeAxes.length > 0) {
        statusText = `🎮 入力中: [${pressedButtons.join(",")}] [${activeAxes.join(" ")}]`;
      }

      updateStatus(statusText);
      animationFrameId = requestAnimationFrame(checkInput);
    }
    
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(checkInput);
  }

  const touchTrigger = () => {
    if (gamepadIndex !== null) return;
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) {
        gamepadIndex = gp.index;
        triggerLoop();
        break;
      }
    }
  };
  window.addEventListener("pointerdown", touchTrigger, { passive: true });
}
