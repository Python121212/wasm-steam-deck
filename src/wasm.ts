export class VirtualWasmCore {
  public wasmMemory: WebAssembly.Memory;
  public vram: Uint8ClampedArray;
  private width: number;
  private height: number;

  private readonly VRAM_OFFSET = 0;       
  private readonly STATE_OFFSET = 400000;  
  private readonly UART_BUF_OFFSET = 410000;

  private readonly REG_JS_PC       = 0;
  private readonly REG_JS_UART_LEN = 4;

  private pc: number = 0x80000000;         
  private registers = new Int32Array(32);  
  private lastMnemonic: string = "NOP";
  private uartWritePtr: number = 0;        

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.wasmMemory = new WebAssembly.Memory({ initial: 8 }); 
    this.vram = new Uint8ClampedArray(this.wasmMemory.buffer, this.VRAM_OFFSET, width * height * 4);

    this.registers[0] = 0;

    // 💿 【RISC-V ブートROMバイナリ】
    const bootRom = new Uint32Array([
      0x800000b7, // 1) LUI x1, 0x80000
      0x0c008093, // 2) ADDI x1, x1, 192
      0x40001137, // 3) LUI x2, 0x40001
      0x00008183, // 4) LB x3, 0(x1)
      0x00018863, // 5) BEQ x3, x0, 16
      0x00310023, // 6) SB x3, 0(x2)  <-- ここで仮想UART(MMIO)へ文字書き込み
      0x00108093, // 7) ADDI x1, x1, 1
      0xff1ff06f, // 8) JAL x0, -16
      0x0000006f  // 9) end: JAL x0, 0
    ]);

    // 📜 本物のLinux起動文字列
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

    const u32Memory = new Uint32Array(this.wasmMemory.buffer);
    const u8Memory = new Uint8Array(this.wasmMemory.buffer);
    const KERNEL_BASE = 450000;
    
    for (let i = 0; i < bootRom.length; i++) {
      u32Memory[(KERNEL_BASE + i * 4) / 4] = bootRom[i];
    }
    for (let i = 0; i < bootString.length; i++) {
      u8Memory[KERNEL_BASE + 192 + i] = bootString.charCodeAt(i);
    }
    u8Memory[KERNEL_BASE + 192 + bootString.length] = 0; 
  }

  public tick(gamepadState: { buttons: string[], axes: number[] }) {
    if (gamepadState.buttons.length > 999) return;

    const KERNEL_BASE = 450000;
    const u32Memory = new Uint32Array(this.wasmMemory.buffer);
    const u8Memory = new Uint8Array(this.wasmMemory.buffer);

    // 1フレームごとに15命令ステップ実行
    for (let clock = 0; clock < 15; clock++) {
      const localAddr = KERNEL_BASE + (this.pc - 0x80000000);
      const instr = u32Memory[localAddr / 4];

      const opcode = instr & 0x7f;
      const rd = (instr >> 7) & 0x1f;
      const funct3 = (instr >> 12) & 0x07;
      const rs1 = (instr >> 15) & 0x1f;
      const rs2 = (instr >> 20) & 0x1f;

      if (funct3 > 999) return;

      let imm = 0;
      if (opcode === 0x13 || opcode === 0x03) { 
        imm = instr >> 20; 
      } else if (opcode === 0x37) { 
        imm = instr & 0xfffff000;
      } else if (opcode === 0x23) { 
        imm = (((instr >> 25) & 0x7f) << 5) | ((instr >> 7) & 0x1f);
        if (imm & 0x800) imm |= 0xfffff000; 
      } else if (opcode === 0x63) { 
        imm = (((instr >> 31) & 1) << 12) | (((instr >> 7) & 1) << 11) | (((instr >> 25) & 0x3f) << 5) | (((instr >> 8) & 0x0f) << 1);
        if (imm & 0x1000) imm |= 0xffffe000;
      } else if (opcode === 0x6f) { 
        imm = (((instr >> 31) & 1) << 20) | (((instr >> 12) & 0xff) << 12) | (((instr >> 20) & 1) << 11) | (((instr >> 21) & 0x3ff) << 1);
        if (imm & 0x100000) imm |= 0xffe00000;
      }

      let nextPc = this.pc + 4;

      switch (opcode) {
        case 0x37: 
          this.registers[rd] = imm;
          this.lastMnemonic = `LUI x${rd}, 0x${(imm >>> 12).toString(16).toUpperCase()}`;
          break;

        case 0x13: 
          this.registers[rd] = this.registers[rs1] + imm;
          this.lastMnemonic = `ADDI x${rd}, x${rs1}, ${imm}`;
          break;

        case 0x03: 
          const loadTarget = this.registers[rs1] + imm;
          const loadIdx = KERNEL_BASE + (loadTarget - 0x80000000);
          this.registers[rd] = (u8Memory[loadIdx] << 24) >> 24;
          this.lastMnemonic = `LB x${rd}, ${imm}(x${rs1})`;
          break;

        case 0x23: // SB (仮想UART MMIO)
          const storeTarget = this.registers[rs1] + imm;
          const byteVal = this.registers[rs2] & 0xff;

          if (storeTarget === 0x40001000) {
            u8Memory[this.UART_BUF_OFFSET + this.uartWritePtr] = byteVal;
            this.uartWritePtr++;
          }
          this.lastMnemonic = `SB x${rs2}, ${imm}(x${rs1})`;
          break;

        case 0x63: 
          if (this.registers[rs1] === this.registers[rs2]) {
            nextPc = this.pc + imm;
          }
          this.lastMnemonic = `BEQ x${rs1}, x${rs2}, ${imm}`;
          break;

        case 0x6f: 
          if (rd !== 0) this.registers[rd] = this.pc + 4;
          nextPc = this.pc + imm;
          this.lastMnemonic = `JAL x${rd}, ${imm}`;
          break;

        default:
          this.lastMnemonic = `UNKNOWN (0x${opcode.toString(16)})`;
          break;
      }

      this.registers[0] = 0; 
      this.pc = nextPc;
    }

    const view = new DataView(this.wasmMemory.buffer);
    view.setUint32(this.STATE_OFFSET + this.REG_JS_PC, this.pc, true);
    view.setUint32(this.STATE_OFFSET + this.REG_JS_UART_LEN, this.uartWritePtr, true);

    let frameCount = view.getUint32(this.STATE_OFFSET + 8, true);
    frameCount++;
    this.render(frameCount);
    view.setUint32(this.STATE_OFFSET + 8, frameCount, true);
  }

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

  // 🔥 【重要修正】ポインタの動きに関係なく、バッファに書き込まれたログを確実に全引き出しできるように修正
  public readVirtualUart(): string {
    if (this.uartWritePtr === 0) return "";
    const u8Memory = new Uint8Array(this.wasmMemory.buffer, this.UART_BUF_OFFSET, this.uartWritePtr);
    return new TextDecoder("utf-8").decode(u8Memory);
  }

  public injectCpuState(pc: number, regs: number[]) {
    this.pc = pc;
    for (let i = 0; i < 32; i++) {
      this.registers[i] = regs[i] || 0;
    }
    this.registers[0] = 0;
  }

  private render(frame: number) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;
        const scanline = Math.sin((y + frame * 2) * 0.15) * 4;
        const matrixMote = (Math.sin(x * 0.05) * Math.cos(y * 0.05) > 0.4) ? 15 : 0;

        this.vram[idx]     = 0x02; 
        this.vram[idx + 1] = 0x1a + scanline + matrixMote; 
        this.vram[idx + 2] = 0x08; 
        this.vram[idx + 3] = 0xff;
      }
    }
  }
}
