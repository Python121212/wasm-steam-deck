export function initDisplay(canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    console.error(`Canvas [${canvasId}] が見つかりません`);
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("2Dコンテキストの取得に失敗しました");
    return;
  }

  // 📺 仮想ゲーム画面の解像度（Steam Deckアスペクト比のコンパクト版: 400x250）
  const WIDTH = 400;
  const HEIGHT = 250;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // WasmのVRAM（ビデオメモリ）を模したピクセルバッファを確保 (RGBAの4バイト構成)
  const bufferSize = WIDTH * HEIGHT * 4;
  const vram = new Uint8ClampedArray(bufferSize);
  const imageData = new ImageData(vram, WIDTH, HEIGHT);

  let frameCount = 0;

  // 🌀 毎フレーム、バックバッファ（VRAM）を直接書き換えて画面に転送するループ
  function renderLoop() {
    frameCount++;

    // ピクセルデータを直接いじる（Wasmが裏で行う処理のシミュレーション）
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const idx = (y * WIDTH + x) * 4;

        // サイバーパンクなグリッド＆グラデーションパターンを計算
        const isGrid = (x % 40 === 0 || y % 40 === 0);
        const movingWave = Math.sin((x + frameCount) * 0.05) * 20;
        const isWave = Math.abs(y - (HEIGHT / 2) - movingWave) < 2;

        if (isWave) {
          // 動く波線（水色）
          vram[idx]     = 0x00; // R
          vram[idx + 1] = 0xff; // G
          vram[idx + 2] = 0xcc; // B
        } else if (isGrid) {
          // グリッド線（暗い紫）
          vram[idx]     = 0x44;
          vram[idx + 1] = 0x00;
          vram[idx + 2] = 0x66;
        } else {
          // 背景グラデーション + 微量のアナログノイズ
          const noise = Math.random() * 15;
          vram[idx]     = Math.max(0, (y / HEIGHT) * 30 + noise - 10);
          vram[idx + 1] = Math.max(0, (x / WIDTH) * 15 + noise - 10);
          vram[idx + 2] = Math.max(0, 20 + noise);
        }
        
        vram[idx + 3] = 0xff; // 不透明度（Alphaは常にMAX）
      }
    }

    // 🚀 完全に仕上がったピクセル塊を、一撃でCanvasへ超高速転送（オーバーヘッドほぼゼロ）
    ctx.putImageData(imageData, 0, 0);

    requestAnimationFrame(renderLoop);
  }

  // ループ起動
  requestAnimationFrame(renderLoop);
  console.log("📺 高速ピクセルバッファ描画レイヤーが起動しました。");
}
