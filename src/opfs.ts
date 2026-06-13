export async function testOPFS(): Promise<boolean> {
  try {
    // 1. OPFSのルートディレクトリを取得
    const root = await navigator.storage.getDirectory();
    
    // 2. 仮想ディスクファイル（仮）を作成・オープン
    const fileHandle = await root.getFileHandle("virtual_disk.img", { create: true });
    
    // 3. 高速ランダムアクセスのためのAccessHandleを同期的に開く（Chromium系で爆速）
    // @ts-ignore (最新APIのため型定義エラー回避)
    const accessHandle = await fileHandle.createWritable();
    
    // 4. テストデータ（1MBのゼロデータ）を書き込んでみる
    const testData = new Uint8Array(1024 * 1024);
    const writer = accessHandle.getWriter();
    await writer.write(testData);
    await writer.close();
    
    return true;
  } catch (e) {
    console.error("OPFS Error:", e);
    return false;
  }
}

