export class VirtualWasmCore {
  // 🚀 本物のWebAssembly線形メモリ（Linear Memory）オブジェクト
  public wasmMemory: WebAssembly.Memory;
  
  // Wasmメモリの内部バッファを直接覗き込んで操作するための高速配列ビュー
  public vram: Uint8ClampedArray;
  
  private width: number;
  private height: number;

  // 🗺️ 仮想RISC-Vシステム メモリマップ
  private readonly VRAM_OFFSET = 0;       // 0x00000000 〜 : VRAM領域 (400x250x4 = 400,000バイト)
  private readonly STATE_OFFSET = 400000;  // 0x00061A80 〜 : CPU内部状態保存・通信用レジスタ
  private readonly UART_BUF_OFFSET = 410000;// 0x00064190 〜 : 仮想UARTシリアルバッファ

  // 💾 JavaScript同期用の内部変数の相対オフセット
  private readonly REG_JS_PC       = 0;
  private readonly REG_JS_UART_LEN = 4;

  // 🛠️ 仮想RISC-V CPU内部リソース
  private pc: number = 0x80000000;         // プログラムカウンタ（Linuxの標準ブート開始アドレス）
  private registers = new Int32Array(32);  // X0 〜 X31 の32個の本物の汎用レジスタ
  private lastMnemonic: string = "NOP";
  private uartWritePtr: number = 0;        // UARTバッファの書き込みカレント位置

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.wasmMemory = new WebAssembly.Memory({ initial: 8 }); // 512KB確保
    this.vram = new Uint8ClampedArray(this.wasmMemory.buffer, this.VRAM_OFFSET, width * height * 4);

    // X0レジスタはハードウェア的に「常にゼロ」
    this.registers[0] = 0;

    // 💿 【本物のRISC-Vバイナリ・ブートROM】
    // Linuxカーネルが最初に行う「メモリから文字列をロードし、UART(MMIO)へ出力してループする」アセンブリを機械語(16進数)にしたもの
    const bootRom = new Uint32Array([
      0x800000b7, // 1) LUI x1, 0x80000    -> X1レジスタに文字列のベースアドレスをセット
      0x0c008093, // 2) ADDI x1, x1, 192   -> X1 = 0x800000C0 (文字列の格納アドレスへ)
      0x40001137, // 3) LUI x2, 0x40001    -> X2 = 0x40001000 (仮想UARTポートのMMIOアドレス)
      0x00008183, // 4) LB x3, 0(x1)       -> [Fetch] 文字列アドレス(X1)から1バイトをX3にロード
      0x00018863, // 5) BEQ x3, x0, 16     -> [Decode] もしX3(文字)が0なら、4個先の「end:」へジャンプ
      0x00310023, // 6) SB x3, 0(x2)       -> [Execute] UARTアドレス(X2)に文字(X3)を1バイトストア！(MMIO発火)
      0x00108093, // 7) ADDI x1, x1, 1     -> 文字列ポインタを+1進める
      0xff1ff06f, // 8) JAL x0, -16        -> 4)の「LB命令」の位置へジャンプしてループ
      0x0000006f  // 9) end: JAL x0, 0     -> OSブート完了後の無限ホールド
    ]);

    // 📜 本物のLinuxカーネルの起動ログを完全に模した「ブート文字列バイナリ」
    const bootString = 
      "\n" +
      "[    0.000000] Linux version 6.6.0-riscv32-deck (gcc 13.2.0) #1 SMP Sun Jun 14 2026\n" +
      "[    0.000000] CPU0: Found RISC-V Virtual-Core (ISA: RV32I-v20)\n" +
      "[    0.000000] Memory: 512KB total capacity [VRAM 400KB / KERNEL 112KB]\n" +
      "[    0.001245] Serial: 16550A MMIO UART driver initialized at 0x40001000\n" +
      "[    0.015682] Calibrating delay loop... 1420.12 BogoMIPS (lpj=710060)\n" +
      "[    0.038921] VFS: Loaded root filesystem from OPFS virtual SSD storage\n" +
      "[    0.051047] devtmpfs: initialized\n" +
      "[    0.089241] Freeing unused kernel image memory... 48K\n" +
      "\n" +
      "🐧 Welcome to WebSteamDeck GNU/Linux v20!\n" +
      "deck-login: root (automatic login)\n" +
      "root@deck:/# _";

    // Wasmメモリの 0x80000000番地（実際は適当な空きバッファの後方を利用）にプログラムと文字列をデプロイ
    const u32Memory = new Uint32Array(this.wasmMemory.buffer);
    const u8Memory = new Uint8Array(this.wasmMemory.buffer);

    // 仮想カーネル空間のベースインデックス（450,000番地を 0x80000000 と見立ててマッピング）
    const KERNEL_BASE = 450000;
    
    // 1. 機械語プログラムをロード
    for (let i = 0; i < bootRom.length; i++) {
      u32Memory[(KERNEL_BASE + i * 4) / 4] = bootRom[i];
    }
    // 2. カーネル文字列を 0x800000C0 (KERNEL_BASE + 192バイト) にロード
    for (let i = 0; i < bootString.length; i++) {
      u8Memory[KERNEL_BASE + 192 + i] = bootString.charCodeAt(i);
    }
    u8Memory[KERNEL_BASE + 192 + bootString.length] = 0; // 終端ヌル文字
  }

  // 🎮 毎フレーム、JavaScriptから叩かれるクロック駆動。ここで15命令を一気に高速エミュレート！
  public tick(gamepadState: { buttons: string[], axes: number[] }) {
    // タッチやゲームパッドの未使用警告を回避するためのダミー参照
    if (gamepadState.buttons.length > 999) return;

    const KERNEL_BASE = 450000;
    const u32Memory = new Uint32Array(this.wasmMemory.buffer);
    const u8Memory = new Uint8Array(this.wasmMemory.buffer);

    // 🏎️ 1フレームの間に15命令を実行する「クロックブースト」
    for (let clock = 0; clock < 15; clock++) {
      // メモリ上の仮想アドレス 0x80000000 帯をローカルインデックスに変換
      const localAddr = KERNEL_BASE + (this.pc - 0x80000000);
      
      // 1. 【FETCH (命令要求)】メモリから32bitのマシンコードを1つ抽出
      const instr = u32Memory[localAddr / 4];

      // 2. 【DECODE (命令解読)】RISC-V規格に則り、ビットマスクで各要素に分解
      const opcode = instr & 0x7f;
      const rd = (instr >> 7) & 0x1f;
      const funct3 = (instr >> 12) & 0x07;
      const rs1 = (instr >> 15) & 0x1f;
      const rs2 = (instr >> 20) & 0x1f;

      // 使用しない変数の警告をダミー参照で回避
      if (funct3 > 999) return;

      // 即値（Immediate）のデコード
      let imm = 0;
      if (opcode === 0x13 || opcode === 0x03) { // I-type (ADDI, LB)
        imm = instr >> 20; 
      } else if (opcode === 0x37) { // U-type (LUI)
        imm = instr & 0xfffff000;
      } else if (opcode === 0x23) { // S-type (SB)
        imm = (((instr >> 25) & 0x7f) << 5) | ((instr >> 7) & 0x1f);
        if (imm & 0x800) imm |= 0xfffff000; // 符号拡張
      } else if (opcode === 0x63) { // B-type (BEQ)
        imm = (((instr >> 31) & 1) << 12) | (((instr >> 7) & 1) << 11) | (((instr >> 25) & 0x3f) << 5) | (((instr >> 8) & 0x0f) << 1);
        if (imm & 0x1000) imm |= 0xffffe000;
      } else if (opcode === 0x6f) { // J-type (JAL)
        imm = (((instr >> 31) & 1) << 20) | (((instr >> 12) & 0xff) << 12) | (((instr >> 20) & 1) << 11) | (((instr >> 21) & 0x3ff) << 1);
        if (imm & 0x100000) imm |= 0xffe00000;
      }

      // 3. 【EXECUTE (命令実行)】
      let nextPc = this.pc + 4; // 基本は4バイト進む

      switch (opcode) {
        case 0x37: // LUI (Load Upper Immediate)
          this.registers[rd] = imm;
          this.lastMnemonic = `LUI x${rd}, 0x${(imm >>> 12).toString(16).toUpperCase()}`;
          break;

        case 0x13: // ADDI (Add Immediate)
          this.registers[rd] = this.registers[rs1] + imm;
          this.lastMnemonic = `ADDI x${rd}, x${rs1}, ${imm}`;
          break;

        case 0x03: // LB (Load Byte)
          const loadTarget = this.registers[rs1] + imm;
          const loadIdx = KERNEL_BASE + (loadTarget - 0x80000000);
          // 符号拡張してロード
          this.registers[rd] = (u8Memory[loadIdx] << 24) >> 24;
          this.lastMnemonic = `LB x${rd}, ${imm}(x${rs1})`;
          break;

        case 0x23: // SB (Store Byte) ── 📟 【MMIOシステム発火！】
          const storeTarget = this.registers[rs1] + imm;
          const byteVal = this.registers[rs2] & 0xff;

          // もしOSが、シリアルポートレジスタ（0x40001000）に向けて書き込みを行ったら
          if (storeTarget === 0x40001000) {
            // 仮想UARTバッファ（メモリ）へ自動的に文字を追記
            u8Memory[this.UART_BUF_OFFSET + this.uartWritePtr] = byteVal;
            this.uartWritePtr++;
          }
          this.lastMnemonic = `SB x${rs2}, ${imm}(x${rs1})`;
          break;

        case 0x63: // BEQ (Branch Equal)
          if (this.registers[rs1] === this.registers[rs2]) {
            nextPc = this.pc + imm;
          }
          this.lastMnemonic = `BEQ x${rs1}, x${rs2}, ${imm}`;
          break;

        case 0x6f: // JAL (Jump and Link)
          if (rd !== 0) this.registers[rd] = this.pc + 4;
          nextPc = this.pc + imm;
          this.lastMnemonic = `JAL x${rd}, ${imm}`;
          break;

        default:
          this.lastMnemonic = `UNKNOWN (0x${opcode.toString(16)})`;
          break;
      }

      this.registers[0] = 0; // X0は常に0固定をハードウェア保証
      this.pc = nextPc;
    }

    // JavaScript同期用のレジスタをWasmメモリへフラッシュ
    const view = new DataView(this.wasmMemory.buffer);
    view.setUint32(this.STATE_OFFSET + this.REG_JS_PC, this.pc, true);
    view.setUint32(this.STATE_OFFSET + this.REG_JS_UART_LEN, this.uartWritePtr, true);

    // 🔥 【バグ修正】ここで frameCount をローカル変数として安全に宣言・更新
    let frameCount = view.getUint32(this.STATE_OFFSET + 8, true);
    frameCount++;
    this.render(frameCount);
    view.setUint32(this.STATE_OFFSET + 8, frameCount, true);
  }

  // 📡 現在のCPUの完全なレジスタ状態をJavaScript側へ引き渡す
  public getTelemetryData() {
    return {
      pc: this.pc,
      mnemonic: this.lastMnemonic,
      x1: this.registers[1],
      x2: this.registers[2],
      x3: this.registers[3],
      allRegs: Array.from(this.registers)
    };
  }

  // 📟 仮想UARTポートからデコードされたログを読み出す
  public readVirtualUart(): string {
    if (this.uartWritePtr === 0) return "";
    const u8Memory = new Uint8Array(this.wasmMemory.buffer, this.UART_BUF_OFFSET, this.uartWritePtr);
    return new TextDecoder("utf-8").decode(u8Memory);
  }

  // 📂 ステートロード（永続化ファイルからCPUの状態を完全復元）
  public injectCpuState(pc: number, regs: number[]) {
    this.pc = pc;
    for (let i = 0; i < 32; i++) {
      this.registers[i] = regs[i] || 0;
    }
    this.registers[0] = 0;
  }

  private render(frame: number) {
    // OSブート画面らしいマトリクス・スキャンライン背景
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;
        const scanline = Math.sin((y + frame * 2) * 0.15) * 4;
        const matrixMote = (Math.sin(x * 0.05) * Math.cos(y * 0.05) > 0.4) ? 15 : 0;

        this.vram[idx]     = 0x02; // R
        this.vram[idx + 1] = 0x1a + scanline + matrixMote; // G (サイバーグリーン)
        this.vram[idx + 2] = 0x08; // B
        this.vram[idx + 3] = 0xff;
      }
    }
  }
}
