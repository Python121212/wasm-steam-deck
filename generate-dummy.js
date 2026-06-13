const fs = require('fs');
const path = require('path');

try {
  // 11MB (11 * 1024 * 1024 バイト) の空のバッファを作成
  const size = 11 * 1024 * 1024;
  const buffer = Buffer.alloc(size);
  
  // public フォルダ内に書き込み
  const destPath = path.join(__dirname, 'public', 'dummy_game.bin');
  fs.writeFileSync(destPath, buffer);
  
  console.log('✅ [Build Step] 11MBの dummy_game.bin を正常に生成しました。');
} catch (e) {
  console.error('❌ ダミーファイル生成失敗:', e);
}
