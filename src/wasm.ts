export class VirtualWasmCore {
  // 🚀 本物のWebAssembly線形メモリ（Linear Memory）オブジェクト
  public wasmMemory: WebAssembly.Memory;
  
  // Wasmメモリの内部バッファを直接覗き込んで操作するための高速配列ビュー
  public vram: Uint8ClampedArray;
  
  private width: number;
  private height: number;

  // 🗺️ メモリマップ（アドレス配置）
  private readonly VRAM_OFFSET = 0;
  private readonly STATE_OFFSET = 400000; // 400,000番地から変数空間
  private readonly UART_BUF_OFFSET = 410000; // 410,000番地から仮想UARTシリアルバッファ空間

  // レジスタ・変数オフセット（STATE_OFFSETからのバイト相対位置）
  private readonly REG_PX = 0;    // プレイヤーX座標 (float32)
  private readonly REG_PY = 4;    // プレイヤーY座標 (float32)
  private readonly REG_FC = 8;    // フレームカウンター (uint32)
  private readonly REG_PC = 12;   // 🚀 [新設] 仮想CPU プログラムカウンタ (uint32)
  private readonly REG_UART_LEN = 16; // 仮想UARTに書き込まれた文字数 (uint32)

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    // WebAssemblyメモリを初期サイズ8ページ（512KB）確保
    this.wasmMemory = new WebAssembly.Memory({ initial: 8 });

    // Canvas描画用のVRAM領域（400KB分）をダイレクトに切り出し
    this.vram = new Uint8ClampedArray(
      this.wasmMemory.buffer,
      this.VRAM_OFFSET,
      width * height * 4
    );

    // 💾 Wasmの初期レジスタ値をDataViewで直接書き込み
    const view = new DataView(this.wasmMemory.buffer);
    view.setFloat32(this.STATE_OFFSET + this.REG_PX, 200, true);  
    view.setFloat32(this.STATE_OFFSET + this.REG_PY, 125, true);  
    view.setUint32(this.STATE_OFFSET + this.REG_FC, 0, true);     
    // 💡 0x80000000 は、本物のLinuxカーネル（RISC-V等）がメモリ上に展開される一般的な開始アドレスです
    view.setUint32(this.STATE_OFFSET + this.REG_PC, 0x80000000, true);  
    view.setUint32(this.STATE_OFFSET + this.REG_UART_LEN, 0, true); 
  }

  // 🎮 毎フレーム、統合インプットをメモリに受け取って仮想CPUロジックを回す
  public tick(gamepadState: { buttons: string[], axes: number[] }) {
    const view = new DataView(this.wasmMemory.buffer);

    // メモリから現在の変数をロード
    let playerX = view.getFloat32(this.STATE_OFFSET + this.REG_PX, true);
    let playerY = view.getFloat32(this.STATE_OFFSET + this.REG_PY, true);
    let frameCount = view.getUint32(this.STATE_OFFSET + this.REG_FC, true);
    let virtualPC = view.getUint32(this.STATE_OFFSET + this.REG_PC, true);

    frameCount++;
    view.setUint32(this.STATE_OFFSET + this.REG_FC, frameCount, true);

    // ⚡【CPUエミュレーション】命令を読み進めるように、PCを4バイトずつ擬似インクリメント
    virtualPC += 4;
    if (virtualPC > 0x80001000) {
      virtualPC = 0x80000000; // 一定領域を超えたらブート直後にループバック
    }
    view.setUint32(this.STATE_OFFSET + this.REG_PC, virtualPC, true);

    let dx = 0;
    let dy = 0;

    if (gamepadState.axes.length >= 2) {
      if (Math.abs(gamepadState.axes[0]) > 0.15) dx = gamepadState.axes[0] * 4;
      if (Math.abs(gamepadState.axes[1]) > 0.15) dy = gamepadState.axes[1] * 4;
    }

    if (gamepadState.buttons.includes("A")) {
      dx *= 2;
      dy *= 2;
    }

    playerX = Math.max(10, Math.min(this.width - 10, playerX + dx));
    playerY = Math.max(10, Math.min(this.height - 10, playerY + dy));

    // 計算結果をWasm変数アドレスへ再ストア
    view.setFloat32(this.STATE_OFFSET + this.REG_PX, playerX, true);
    view.setFloat32(this.STATE_OFFSET + this.REG_PY, playerY, true);

    // 📟 【仮想UART通信処理】蛍光灯データを完全排除し、純粋なCPUステータスをストリーム出力！
    const uartString = `[UART_TX] PC:0x${virtualPC.toString(16).toUpperCase()}  X:${playerX.toFixed(1)}  Y:${playerY.toFixed(1)}  FRAME:${frameCount}`;
    const u8Memory = new Uint8Array(this.wasmMemory.buffer);
    
    for (let i = 0; i < uartString.length; i++) {
      u8Memory[this.UART_BUF_OFFSET + i] = uartString.charCodeAt(i);
    }
    // レジスタに現在の有効文字数をストアして、外部（JavaScript）へ送信完了を通知
    view.setUint32(this.STATE_OFFSET + this.REG_UART_LEN, uartString.length, true);

    // VRAM描画実行（背景と自機のみのクリアな画面へ）
    this.render(playerX, playerY, gamepadState.buttons.includes("A"), frameCount);
  }

  // 📡 現在のメモリ上のテレメトリ値を生データで引っこ抜くヘルパー
  public getTelemetryData() {
    const view = new DataView(this.wasmMemory.buffer);
    return {
      x: view.getFloat32(this.STATE_OFFSET + this.REG_PX, true),
      y: view.getFloat32(this.STATE_OFFSET + this.REG_PY, true),
      pc: view.getUint32(this.STATE_OFFSET + this.REG_PC, true)
    };
  }

  // 📟 JavaScript(QEMU側)がWasmの生メモリ空間から直接シリアル文字列を吸い出すメソッド
  public readVirtualUart(): string {
    const view = new DataView(this.wasmMemory.buffer);
    const len = view.getUint32(this.STATE_OFFSET + this.REG_UART_LEN, true);
    if (len === 0) return "";

    const u8Memory = new Uint8Array(this.wasmMemory.buffer, this.UART_BUF_OFFSET, len);
    return new TextDecoder("utf-8").decode(u8Memory);
  }

  public injectPlayerPosition(x: number, y: number) {
    const view = new DataView(this.wasmMemory.buffer);
    view.setFloat32(this.STATE_OFFSET + this.REG_PX, x, true);
    view.setFloat32(this.STATE_OFFSET + this.REG_PY, y, true);
  }

  private render(pX: number, pY: number, isPressed: boolean, frame: number) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;

        const isPlayer = Math.abs(x - pX) < 6 && Math.abs(y - pY) < 6;
        const scanline = Math.sin((y + frame) * 0.1) * 3;

        if (isPlayer) {
          this.vram[idx]     = isPressed ? 0xff : 0x00; 
          this.vram[idx + 1] = isPressed ? 0x00 : 0xff; 
          this.vram[idx + 2] = 0xff; 
        } else {
          const isGrid = (x % 20 === 0 || y % 20 === 0);
          this.vram[idx]     = isGrid ? 0x1e + scanline : 0x06;
          this.vram[idx + 1] = isGrid ? 0x00 : 0x06;
          this.vram[idx + 2] = isGrid ? 0x3a + scanline : 0x18;
        }
        this.vram[idx + 3] = 0xff; 
      }
    }
  }
}
