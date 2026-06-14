export function initGamepad(updateStatus: (msg: string) => void) {
  let gamepadIndex: number | null = null;
  let animationFrameId: number | null = null;

  // コントローラーが新しく接続されたとき
  window.addEventListener("gamepadconnected", (e) => {
    gamepadIndex = e.gamepad.index;
    console.log("Gamepad connected:", e.gamepad);
    triggerLoop();
  });

  // コントローラーが切断されたとき
  window.addEventListener("gamepaddisconnected", (e) => {
    if (gamepadIndex === e.gamepad.index) {
      gamepadIndex = null;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      updateStatus("❌ 未接続");
    }
  });

  // 🕹️ 1ms単位で入力を監視し、画面のステータスを一瞬で書き換える高速ループ
  function triggerLoop() {
    function checkInput() {
      if (gamepadIndex === null) return;
      
      // 最新のゲームパッド状態を取得
      const gamepads = navigator.getGamepads();
      const gp = gamepads[gamepadIndex];

      if (!gp) {
        animationFrameId = requestAnimationFrame(checkInput);
        return;
      }

      // ① 押されているボタンの検出 (A, B, X, Y, トリガー等)
      const pressedButtons: string[] = [];
      gp.buttons.forEach((btn, idx) => {
        if (btn.pressed) {
          // 主要なボタンにわかりやすい名前を割り当て
          if (idx === 0) pressedButtons.push("A");
          else if (idx === 1) pressedButtons.push("B");
          else if (idx === 2) pressedButtons.push("X");
          else if (idx === 3) pressedButtons.push("Y");
          else pressedButtons.push(`B${idx}`); // L/Rやセレクトなど
        }
      });

      // ② アナログスティックの検出 (デッドゾーン 0.15 で誤作動防止)
      const activeAxes: string[] = [];
      gp.axes.forEach((axis, idx) => {
        if (Math.abs(axis) > 0.15) {
          const dir = axis > 0 ? "+" : "";
          if (idx === 0) activeEntries(activeAxes, `LスティックX:${dir}${axis.toFixed(1)}`);
          if (idx === 1) activeEntries(activeAxes, `LスティックY:${dir}${axis.toFixed(1)}`);
          if (idx === 2) activeEntries(activeAxes, `RスティックX:${dir}${axis.toFixed(1)}`);
          if (idx === 3) activeEntries(activeAxes, `RスティックY:${dir}${axis.toFixed(1)}`);
        }
      });

      // 画面の「🕹️ コントローラー: 」の後ろにはめ込む文字列を生成
      let statusText = `🟢 接続中: ${gp.id.slice(0, 12)}...`;
      
      if (pressedButtons.length > 0 || activeAxes.length > 0) {
        const btnStr = pressedButtons.length > 0 ? ` [${pressedButtons.join(",")}]` : "";
        const axisStr = activeAxes.length > 0 ? ` [${activeAxes.join(" ")}]` : "";
        statusText = `🎮 入力中:${btnStr}${axisStr}`;
      }

      updateStatus(statusText);
      animationFrameId = requestAnimationFrame(checkInput);
    }
    
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(checkInput);
  }

  function activeEntries(arr: string[], val: string) {
    arr.push(val);
  }

  // 🔥 【スマホ専用フォールバック】
  // スマホのブラウザは「接続済み」のコントローラーがあっても、画面を1回触るまで隠す仕様があるため、
  // 画面がタップされた瞬間に強制的にコントローラーをサーチしにいきます。
  const touchTrigger = () => {
    if (gamepadIndex !== null) return; // 既に掴んでるならスルー
    
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
