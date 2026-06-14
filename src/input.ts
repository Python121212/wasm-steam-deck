// 🎮 すべての入力ソースが合流する一元化レジスタ
export const currentGamepadState = {
  buttons: [] as string[],
  axes: [0, 0, 0, 0] as number[] // [左スティックX, 左スティックY, ...]
};

export function initGamepad(updateStatus: (msg: string) => void) {
  let gamepadIndex: number | null = null;

  // ⌨️ キーボードの入力ステータス
  const keys = {
    up: false, down: false, left: false, right: false, btnA: false
  };

  // 📱 仮想UIの入力ステータス
  const vStick = { x: 0, y: 0, btnA: false };

  // --- 1. キーボード監視登録 ---
  window.addEventListener("keydown", (e) => {
    if (e.key === "w" || e.key === "ArrowUp") keys.up = true;
    if (e.key === "s" || e.key === "ArrowDown") keys.down = true;
    if (e.key === "a" || e.key === "ArrowLeft") keys.left = true;
    if (e.key === "d" || e.key === "ArrowRight") keys.right = true;
    if (e.key === " " || e.key === "z" || e.key === "Enter") keys.btnA = true;
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "w" || e.key === "ArrowUp") keys.up = false;
    if (e.key === "s" || e.key === "ArrowDown") keys.down = false;
    if (e.key === "a" || e.key === "ArrowLeft") keys.left = false;
    if (e.key === "d" || e.key === "ArrowRight") keys.right = false;
    if (e.key === " " || e.key === "z" || e.key === "Enter") keys.btnA = false;
  });

  // --- 2. 物理ゲームパッド監視登録 ---
  window.addEventListener("gamepadconnected", (e) => {
    gamepadIndex = e.gamepad.index;
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    if (gamepadIndex === e.gamepad.index) gamepadIndex = null;
  });

  // --- 3. 仮想コントローラータッチ監視登録 ---
  setTimeout(() => {
    const base = document.getElementById("v-stick-base");
    const knob = document.getElementById("v-stick-knob");
    const btnA = document.getElementById("v-btn-a");

    if (base && knob) {
      const maxRadius = 40; // スティックの最大可動領域(px)

      const updateStickPosition = (e: PointerEvent) => {
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let dx = e.clientX - centerX;
        let dy = e.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 限界を超えたら円周上にクランプ
        if (distance > maxRadius) {
          dx = (dx / distance) * maxRadius;
          dy = (dy / distance) * maxRadius;
        }

        knob.style.transform = `translate(${dx}px, ${dy}px)`;

        // -1.0 〜 1.0 の間でアナログ正規化
        vStick.x = dx / maxRadius;
        vStick.y = dy / maxRadius;
      };

      base.addEventListener("pointerdown", (e) => {
        base.setPointerCapture(e.pointerId);
        updateStickPosition(e);
      });

      base.addEventListener("pointermove", (e) => {
        if (base.hasPointerCapture(e.pointerId)) {
          updateStickPosition(e);
        }
      });

      const resetStick = (e: PointerEvent) => {
        if (base.hasPointerCapture(e.pointerId)) {
          base.releasePointerCapture(e.pointerId);
        }
        vStick.x = 0;
        vStick.y = 0;
        knob.style.transform = `translate(0px, 0px)`;
      };

      base.addEventListener("pointerup", resetStick);
      base.addEventListener("pointercancel", resetStick);
    }

    if (btnA) {
      btnA.addEventListener("pointerdown", () => { vStick.btnA = true; });
      btnA.addEventListener("pointerup", () => { vStick.btnA = false; });
      btnA.addEventListener("pointercancel", () => { vStick.btnA = false; });
    }
  }, 100);

  // 🔥 【マスターインプットループ】すべての入力デバイスの論理和(OR)をとって一本化
  function masterInputLoop() {
    let finalX = 0;
    let finalY = 0;
    let isAPressed = false;
    let activeDevice = "⌨️ 仮想・KB入力待機中";

    // A) キーボードの値をマッピング
    if (keys.left) finalX = -1;
    if (keys.right) finalX = 1;
    if (keys.up) finalY = -1;
    if (keys.down) finalY = 1;
    if (keys.btnA) isAPressed = true;

    // B) スマホ仮想タッチが動いていればブレンド（上書き）
    if (Math.abs(vStick.x) > 0.05 || Math.abs(vStick.y) > 0.05) {
      finalX = vStick.x;
      finalY = vStick.y;
      activeDevice = "📱 仮想スティック";
    }
    if (vStick.btnA) isAPressed = true;

    // C) 物理ゲームパッドがあれば最優先
    if (gamepadIndex !== null) {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[gamepadIndex];
      if (gp) {
        activeDevice = `🎮 物理パッド:${gp.id.slice(0, 6)}`;
        if (gp.axes.length >= 2) {
          if (Math.abs(gp.axes[0]) > 0.15) finalX = gp.axes[0];
          if (Math.abs(gp.axes[1]) > 0.15) finalY = gp.axes[1];
        }
        gp.buttons.forEach((btn, idx) => {
          if (btn.pressed) {
            if (idx === 0 || idx === 1) isAPressed = true; // AまたはBボタン
          }
        });
      }
    }

    // 🌟 Wasm共有ポートにデータを叩き込む
    currentGamepadState.axes[0] = finalX;
    currentGamepadState.axes[1] = finalY;
    currentGamepadState.buttons = isAPressed ? ["A"] : [];

    // ステータス表示の更新
    let statusText = activeDevice;
    if (Math.abs(finalX) > 0.1 || Math.abs(finalY) > 0.1 || isAPressed) {
      statusText += ` [X:${finalX.toFixed(1)} Y:${finalY.toFixed(1)}] ${isAPressed ? "[A]" : ""}`;
    }
    updateStatus(statusText);

    requestAnimationFrame(masterInputLoop);
  }

  // マスター合成ループ起動
  requestAnimationFrame(masterInputLoop);

  // iOSロック解除用フォールバック
  const touchTrigger = () => {
    if (gamepadIndex !== null) return;
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) { gamepadIndex = gp.index; break; }
    }
  };
  window.addEventListener("pointerdown", touchTrigger, { passive: true });
}
