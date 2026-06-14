export class VirtualWasmCore {
  // Wasmの線形メモリ（Linear Memory）を模したバイト配列
  public memory: Uint8ClampedArray;
  private width: number;
  private height: number;
  
  // プレイヤー（ドット）の初期位置
  private playerX: number = 200;
  private playerY: number = 125;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    // RGBA (4バイト) ✕ 全ピクセル分のメモリを確保
    this.memory = new Uint8ClampedArray(width * height * 4);
  }

  // 🎮 毎フレーム、コントローラーの入力情報（Wasmのインプットポート）を受け取って演算
  public tick(gamepadState: { buttons: string[], axes: number[] }) {
    // ① スティックまたは十字キーの入力を解析してプレイヤーを移動
    let dx = 0;
    let dy = 0;

    // アナログスティックの値を加算
    if (gamepadState.axes.length >= 2) {
      if (Math.abs(gamepadState.axes[0]) > 0.15) dx = gamepadState.axes[0] * 4;
      if (Math.abs(gamepadState.axes[1]) > 0.15) dy = gamepadState.axes[1] * 4;
    }

    // ボタン（A/B/X/Y）が押されていたら移動スピードをブースト
    if (gamepadState.buttons.includes("A")) {
      dx *= 2;
      dy *= 2;
    }

    this.playerX = Math.max(10, Math.min(this.width - 10, this.playerX + dx));
    this.playerY = Math.max(10, Math.min(this.height - 10, this.playerY + dy));

    // ② 演算結果をWasmのビデオメモリ（VRAM）領域へ書き込み（レンダリング）
    this.render(gamepadState.buttons.length > 0);
  }

  // メモリへのピクセル書き込みロジック
  private render(isButtonPressed: boolean) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;

        // プレイヤー（自機）の描画判定（12x12のクロス十字）
        const isPlayer = Math.abs(x - this.playerX) < 6 && Math.abs(y - this.playerY) < 6;
        
        if (isPlayer) {
          // 自機の色（ボタンを押している間は赤、通常は緑）
          this.memory[idx]     = isButtonPressed ? 0xff : 0x00; // R
          this.memory[idx + 1] = isButtonPressed ? 0x00 : 0xff; // G
          this.memory[idx + 2] = 0x88;                          // B
        } else {
          // 背景：グリッドとサイバーな残像パターン
          const isGrid = (x % 20 === 0 || y % 20 === 0);
          this.memory[idx]     = isGrid ? 0x11 : 0x02;
          this.memory[idx + 1] = isGrid ? 0x00 : 0x02;
          this.memory[idx + 2] = isGrid ? 0x22 : 0x0a;
        }
        this.memory[idx + 3] = 0xff; // Alpha
      }
    }
  }
}
