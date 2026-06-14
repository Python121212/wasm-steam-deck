export class VirtualWasmCore {
  public wasmMemory: WebAssembly.Memory;
  public vram: Uint8ClampedArray;
  private width: number;
  private height: number;

  private readonly VRAM_OFFSET = 0;
  private readonly STATE_OFFSET = 400000; 
  private readonly UART_BUF_OFFSET = 410000; 

  private readonly REG_PX = 0;    
  private readonly REG_PY = 4;    
  private readonly REG_FC = 8;    
  private readonly REG_LX = 12;   
  private readonly REG_LY = 16;   
  private readonly REG_DIST = 20; 
  private readonly REG_UART_LEN = 24; 

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.wasmMemory = new WebAssembly.Memory({ initial: 8 });
    this.vram = new Uint8ClampedArray(this.wasmMemory.buffer, this.VRAM_OFFSET, width * height * 4);

    const view = new DataView(this.wasmMemory.buffer);
    view.setFloat32(this.STATE_OFFSET + this.REG_PX, 200, true);  
    view.setFloat32(this.STATE_OFFSET + this.REG_PY, 125, true);  
    view.setUint32(this.STATE_OFFSET + this.REG_FC, 0, true);     
    view.setFloat32(this.STATE_OFFSET + this.REG_LX, 300, true);  
    view.setFloat32(this.STATE_OFFSET + this.REG_LY, 70, true);   
    view.setFloat32(this.STATE_OFFSET + this.REG_DIST, 0, true);  
    view.setUint32(this.STATE_OFFSET + this.REG_UART_LEN, 0, true); 
  }

  public tick(gamepadState: { buttons: string[], axes: number[] }) {
    const view = new DataView(this.wasmMemory.buffer);

    let playerX = view.getFloat32(this.STATE_OFFSET + this.REG_PX, true);
    let playerY = view.getFloat32(this.STATE_OFFSET + this.REG_PY, true);
    let frameCount = view.getUint32(this.STATE_OFFSET + this.REG_FC, true);
    const lightX = view.getFloat32(this.STATE_OFFSET + this.REG_LX, true);
    const lightY = view.getFloat32(this.STATE_OFFSET + this.REG_LY, true);

    frameCount++;
    view.setUint32(this.STATE_OFFSET + this.REG_FC, frameCount, true);

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

    const ldx = playerX - lightX;
    const ldy = playerY - lightY;
    const distance = Math.sqrt(ldx * ldx + ldy * ldy);

    view.setFloat32(this.STATE_OFFSET + this.REG_PX, playerX, true);
    view.setFloat32(this.STATE_OFFSET + this.REG_PY, playerY, true);
    view.setFloat32(this.STATE_OFFSET + this.REG_DIST, distance, true);

    // 📟 仮想UARTシリアル転送ロジック
    const uartString = `[UART_TX] FRAME:${frameCount} X:${playerX.toFixed(1)} Y:${playerY.toFixed(1)} DIST:${distance.toFixed(1)}`;
    const u8Memory = new Uint8Array(this.wasmMemory.buffer);
    
    for (let i = 0; i < uartString.length; i++) {
      u8Memory[this.UART_BUF_OFFSET + i] = uartString.charCodeAt(i);
    }
    view.setUint32(this.STATE_OFFSET + this.REG_UART_LEN, uartString.length, true);

    this.render(playerX, playerY, lightX, lightY, gamepadState.buttons.includes("A"), frameCount);
  }

  public getTelemetryData() {
    const view = new DataView(this.wasmMemory.buffer);
    return {
      x: view.getFloat32(this.STATE_OFFSET + this.REG_PX, true),
      y: view.getFloat32(this.STATE_OFFSET + this.REG_PY, true),
      distance: view.getFloat32(this.STATE_OFFSET + this.REG_DIST, true)
    };
  }

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

  private render(pX: number, pY: number, lX: number, lY: number, isPressed: boolean, frame: number) {
    const lightPulse = Math.sin(frame * 0.1) * 15 + 240; 

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;

        const isPlayer = Math.abs(x - pX) < 6 && Math.abs(y - pY) < 6;
        const isLight = Math.abs(x - lX) < 15 && Math.abs(y - lY) < 2;
        const scanline = Math.sin((y + frame) * 0.1) * 3;

        if (isPlayer) {
          this.vram[idx]     = isPressed ? 0xff : 0x00; 
          this.vram[idx + 1] = isPressed ? 0x00 : 0xff; 
          this.vram[idx + 2] = 0xff; 
        } else if (isLight) {
          this.vram[idx]     = lightPulse;
          this.vram[idx + 1] = lightPulse;
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
