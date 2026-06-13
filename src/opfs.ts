async function fetchRangeChunk(url: string, start: number, end: number): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { 'Range': `bytes=${start}-${end}` }
  });

  if (response.status !== 206) {
    throw new Error(`Rangeエラー: ${response.status}`);
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
    
    // 💡【重要】@ts-ignore をつけて、TypeScriptの型エラーを強制的に黙らせます
    // @ts-ignore
    await writable.write({
      type: 'write',
      position: targetOffset,
      data: chunkData
    });
    
    await writable.close();
    return `成功: ${targetOffset}バイト目〜 同期完了！`;
  } catch (e: any) {
    console.error("Streaming Error:", e);
    return `失敗: ${e.message}`;
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
