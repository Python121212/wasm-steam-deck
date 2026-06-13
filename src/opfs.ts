// サーバーから特定のバイト範囲を狙い撃ちでフェッチする関数
async function fetchRangeChunk(url: string, start: number, end: number): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      // ➔ これがサーバーに「ここだけくれ！」と命じる魔法のヘッダー
      'Range': `bytes=${start}-${end}`
    }
  });

  if (response.status !== 206) {
    throw new Error(`サーバーがRangeリクエスト(206)に対応していません。Status: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// 狙ったセクタ（オフセット）にデータをピンポイントで書き込む / 読み込むコアロジック
export async function streamToOPFS(url: string, targetOffset: number, chunkSize: number): Promise<string> {
  try {
    const root = await navigator.storage.getDirectory();
    // 仮想の特大ゲームディスク（仮）を開く
    const fileHandle = await root.getFileHandle("virtual_game.img", { create: true });
    
    // 1. サーバーから部分データを取得（例：指定オフセットからchunkSize分）
    const startByte = targetOffset;
    const endByte = targetOffset + chunkSize - 1;
    const chunkData = await fetchRangeChunk(url, startByte, endByte);

    // 2. OPFSのファイルストリームを開く
    const writable = await fileHandle.createWritable();
    
    // 3. 【激重要】指定したオフセット（位置）までポインタをジャンプ（シーク）させる
    await writable.write({
      type: 'write',
      position: targetOffset, // ➔ 隙間を空けて好きな場所に書き込める
      data: chunkData
    });
    
    // 保存して閉じる
    await writable.close();

    return `成功: ${startByte}〜${endByte} バイト目を同期完了！`;
  } catch (e: any) {
    console.error("Streaming Error:", e);
    return `失敗: ${e.message}`;
  }
}

// 現在のOPFS上のファイルサイズを確認するデバッグ関数
export async function getVirtualFileSize(): Promise<number> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle("virtual_game.img");
    const file = await fileHandle.getFile();
    return file.size;
  } catch {
    return 0; // まだファイルがない場合
  }
}

// 既存のテストも残しておく
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
