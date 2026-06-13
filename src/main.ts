import './style.css';
import { testOPFS, streamToOPFS, getVirtualFileSize } from './opfs';
import { initGamepad } from './input';

// 画面ログ出力用の共通関数
const printLog = (msg: string, color = "#aaa") => {
  const logEl = document.getElementById("stream-log");
  if (logEl) {
    logEl.innerHTML = msg;
    logEl.style.color = color;
  }
};

// 裏で起きた想定外のエラーをキャッチするガードレール
window.addEventListener('unhandledrejection', (event) => {
  printLog(`🚨 非同期エラー: ${event.reason?.message || event.reason}`, "#ff3366");
});
window.addEventListener('error', (event) => {
  printLog(`🚨 システムエラー: ${event.message}`, "#ff3366");
});

// キャッシュ看破タグ [v6-Live]（黄色）
const title = document.querySelector("#debug-overlay h2");
if (title) {
  title.innerHTML += ' <span style="font-size:12px; color:#ffff00; font-weight:bold;">[v6-Live]</span>';
}

function runValidation() {
  const btnHead = document.getElementById("btn-fetch-head");
  const btnTail = document.getElementById("btn-fetch-tail");
  const streamLogEl = document.getElementById("stream-log");
  
  if (!btnHead || !btnTail || !streamLogEl) {
    alert("HTMLの要素が見つかりません。index.htmlが古い可能性があります。");
    return;
  }

  // 🎯 【超重要：最優先】何が起きても、まず最初にボタンのクリックイベントを絶対登録する！
  // これにより、下のOPFSチェックがフリーズしても、ボタンのタップだけは確実に検知可能になります。
  (btnHead as HTMLButtonElement).onclick = async () => {
    printLog("📱 [0MB] タップを同期検知！フェッチを開始します...", "#00ffcc");
    try {
      const res = await streamToOPFS("/dummy_game.bin", 0, 1024);
      printLog(res, res.includes("失敗") ? "#ff3366" : "#aaa");
    } catch (e: any) {
      printLog(`❌ ボタン内エラー: ${e.message || e}`, "#ff3366");
    }
    // ディスクサイズ表示を安全に更新
    getVirtualFileSize().then(size => {
      const el = document.getElementById("disk-size");
      if (el) el.textContent = size.toLocaleString();
    }).catch(() => {});
  };

  (btnTail as HTMLButtonElement).onclick = async () => {
    printLog("📱 [10MB] タップを同期検知！フェッチを開始します...", "#00ffcc");
    try {
      const res = await streamToOPFS("/dummy_game.bin", 10000000, 1024);
      printLog(res, res.includes("失敗") ? "#ff3366" : "#aaa");
    } catch (e: any) {
      printLog(`❌ ボタン内エラー: ${e.message || e}`, "#ff3366");
    }
    getVirtualFileSize().then(size => {
      const el = document.getElementById("disk-size");
      if (el) el.textContent = size.toLocaleString();
    }).catch(() => {});
  };

  // --- 以降は、止まってもボタン動作を巻き添えにしない安全な個別処理 ---

  // クロスオリジン隔離のチェック
  const sabEl = document.getElementById("status-sab")!;
  if (typeof SharedArrayBuffer !== "undefined") {
    sabEl.textContent = "有効"; sabEl.className = "ok";
  } else {
    sabEl.textContent = "無効"; sabEl.className = "ng";
  }

  // ゲームパッド初期化
  const gamepadEl = document.getElementById("status-gamepad")!;
  initGamepad((msg) => { gamepadEl.textContent = msg; });

  // ⚠️ 【フリーズの容疑者】OPFSのチェックは別ルート（タイマー）に隔離して、
  // メインの処理ラインから完全に切り離します。
  const opfsEl = document.getElementById("status-opfs")!;
  const diskSizeEl = document.getElementById("disk-size")!;
  opfsEl.textContent = "⏳ 接続テスト中...";

  setTimeout(async () => {
    try {
      const opfsSuccess = await testOPFS();
      opfsEl.textContent = opfsSuccess ? "成功" : "失敗";
      opfsEl.className = opfsSuccess ? "ok" : "ng";
      
      const size = await getVirtualFileSize();
      diskSizeEl.textContent = size.toLocaleString();
    } catch (e: any) {
      opfsEl.textContent = "エラー停止";
      opfsEl.className = "ng";
      console.error("OPFS隔離チェック内のエラー:", e);
    }
  }, 50);
}

// ドキュメント読み込み完了時に実行
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runValidation);
} else {
  runValidation();
}
