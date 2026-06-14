import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // 💾 仮想ファイルサイズを「11MB」に設定
  const TOTAL_SIZE = 11 * 1024 * 1024; 

  // スマホのブラウザにRangeリクエストを許可するヘッダー群
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  res.setHeader('Accept-Ranges', 'bytes');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const range = req.headers.range;
  if (!range) {
    // Range指定がない場合は基本情報を返す
    res.setHeader('Content-Length', TOTAL_SIZE);
    return res.status(200).send(Buffer.alloc(1024));
  }

  // Rangeヘッダーの解析 (例: bytes=10000000-10001023)
  const parts = range.replace(/bytes=/, "").split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : start + 1023;

  // 境界線チェック（エラーなら正しく416を出す）
  if (start >= TOTAL_SIZE || end >= TOTAL_SIZE || start > end) {
    res.setHeader('Content-Range', `bytes */${TOTAL_SIZE}`);
    return res.status(416).end();
  }

  // 要求されたサイズ分の空バッファをその場で生成（容量を喰わない）
  const chunkLength = (end - start) + 1;
  const buffer = Buffer.alloc(chunkLength);
  
  // 識別用に先頭に文字を仕込む
  if (chunkLength >= 4) buffer.write("WASM");

  // ✨ 100%完璧な206 Partial Contentヘッダーを自前で組み立てる
  res.setHeader('Content-Range', `bytes ${start}-${end}/${TOTAL_SIZE}`);
  res.setHeader('Content-Length', chunkLength);
  res.setHeader('Content-Type', 'application/octet-stream');
  
  return res.status(206).send(buffer);
}
