// サーバーから特定のバイト範囲を取得（206に対応してなくても200の全取得から切り出す超高耐久仕様）
async function fetchRangeChunk(url: string, start: number, len: number): Promise<Uint8Array> {
  const end = start + len - 1;
  const response = await fetch(url, {
    headers: { 'Range': `bytes=${start}-${end}` }
  });

  // ➔ 万が一サーバーがRange(206)を無視して丸ごと(200)返してきたら、フロント側でちぎる
  if (response.status === 200) {
    const fullBuffer = await response.arrayBuffer();
    return new Uint8Array(fullBuffer).subarray(0, len);
  }

  if (response.status !== 206) {
    throw new Error(`HTTPエラー: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function streamToOPFS(url: string, targetOffset: number, chunkSize: number): Promise<string> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle("virtual_game.img", { create: true });
    
    const chunkData = await fetchRangeChunk(url, targetOffset, chunkSize);
    const writable = await fileHandle.createWritable();
    
    // @ts-ignore
    await writable.write({
      type: 'write',
      position: targetOffset,
      data: chunkData
    });
    
    await writable.close();
    return `成功: ${targetOffset}B目に${chunkData.length}B書き込み！`;
  } catch (e: any) {
    console.error(e);
    return `失敗: ${e.message || e}`;
  }
}

export async function getVirtualFileSize(): Promise<number> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle("virtual_game.img");
    const file = await fileHandle.getFile();
    return file.size;
  } catch {
    return 0;
  }
}

export async function testOPFS(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle("test_status.txt", { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write("OK");
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
