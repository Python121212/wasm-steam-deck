export class VirtualWasmCore {
  // 🚀 本物のWebAssembly線形メモリ（Linear Memory）オブジェクト
  public wasmMemory: WebAssembly.Memory;
  
  // Wasmメモリの内部バッファを直接覗き込んで操作するための高速配列ビュー
  public vram: Uint8ClampedArray;
  
  private width: number;
  private height: number;

  // 🗺️ エミュレータでおなじみの「メモリマップ（アドレス配置）」を自前で定義
  // 400x250x4バイト = 250,000バイト（約244KB）をVRAMとして0番地から配置
  private readonly VRAM_OFFSET = 0;
  // VRAM領域のすぐ後ろ（250,000バイト目）を変数・ステータス格納用レジスタ空間とする
  private readonly STATE_OFFSET = 250000; 

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    // WebAssemblyメモリを初期サイズ8ページ（8 ✕ 64KB = 512KB）確保
    this.wasmMemory = new WebAssembly.Memory({ initial: 8 });

    // 確保したWasmメモリの生バッファから、Canvas描画用のVRAM領域（250KB分）をダイレクトに切り出す
    this.vram = new Uint8ClampedArray(
      this.wasmMemory.buffer,
      this.VRAM_OFFSET,
      width * height * 4
    );

    // 💾 Wasmのメモリマップに初期値をバイト単位で直接書き込む（DataViewを使用）
    const view = new DataView(this.wasmMemory.buffer);
    view.setFloat32(this.STATE_OFFSET + 0, 200, true);  // 250000番地: プレイヤーX座標 (float32)
    view.setFloat32(this.STATE_OFFSET + 4, 125, true);  // 250004番地: プレイヤーY座標 (float32)
    view.setUint32(this.STATE_OFFSET + 8, 0, true);     // 250008番地: フレームカウンター (uint32)
  }

  // 🎮 毎フレーム、統合インプットをメモリに受け取って仮想CPUロジックを回す
  public tick(gamepadState: { buttons: string[], axes: number[] }) {
    // 共有バッファをDataViewで高精度に読み書き（Wasmの i32.load / f32.store などの命令に相当）
    const view = new DataView(this.wasmMemory.buffer);

    // メモリ（アドレス）から直接現在のゲーム状態をロード
    let playerX = view.getFloat32(this.STATE_OFFSET + 0, true);
    let playerY = view.getFloat32(this.STATE_OFFSET + 4, true);
    let frameCount = view.getUint32(this.STATE_OFFSET + 8, true);

    frameCount++;
    view.setUint32(this.STATE_OFFSET + 8, frameCount, true); // メモリ更新

    let dx = 0;
    let dy = 0;

    // 入力状態を解析
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

    // 演算結果をWasmの変数アドレスへ再ストア
    view.setFloat32(this.STATE_OFFSET + 0, playerX, true);
    view.setFloat32(this.STATE_OFFSET + 4, playerY, true);

    // ストアされた状態を元に、メモリ上のVRAM領域を書き換え（描画ロジック実行）
    this.render(playerX, playerY, gamepadState.buttons.includes("A"), frameCount);
  }

  // メモリ上のVRAMピクセルを直接いじる超高速レンダラー
  private render(pX: number, pY: number, isPressed: boolean, frame: number) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;

        const isPlayer = Math.abs(x - pX) < 6 && Math.abs(y - pY) < 6;
        // Wasmメモリの動的変化テスト用：背景にうっすら流れる走査線ノイズをブレンド
        const scanline = Math.sin((y + frame) * 0.1) * 3;

        if (isPlayer) {
          // Aボタンが押されている間は、よりサイバーなエレクトリックマゼンタに変化！
          this.vram[idx]     = isPressed ? 0xff : 0x00; 
          this.vram[idx + 1] = isPressed ? 0x00 : 0xff; 
          this.vram[idx + 2] = 0xff; 
        } else {
          // 背景：走査線ノイズが交差するサイバーグリッド
          const isGrid = (x % 20 === 0 || y % 20 === 0);
          this.vram[idx]     = isGrid ? 0x1e + scanline : 0x06;
          this.vram[idx + 1] = isGrid ? 0x00 : 0x06;
          this.vram[idx + 2] = isGrid ? 0x3a + scanline : 0x18;
        }
        this.vram[idx + 3] = 0xff; // 不透明度
      }
    }
  }
}
