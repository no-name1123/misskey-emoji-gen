import { checkModuleWorker, checkSupport } from './core/support.js';
import { WORKER_URL } from './core/generator.js';
import { ConfigError, loadConfig } from './core/fonts.js';
import { CAUSES } from './ui/errors.js';
import { initMessages, clearMessage, showMessage } from './ui/messages.js';
import { setAllDisabled } from './ui/form.js';
import { startApp } from './ui/app.js';

const BROWSERS = 'Chrome・Edge・Safari・Firefox の最新版でお試しください。';

function showBoot(text, reload = false) {
  document.getElementById('boot-text').textContent = text;
  document.getElementById('boot-reload').hidden = !reload;
}

function handleUnexpected(error) {
  console.error(error);
  showMessage('E-999');
}

async function loadConfigWithRetry(app) {
  clearMessage('E-001');
  showMessage('I-001');
  try {
    const config = await loadConfig();
    clearMessage('I-001');
    return config;
  } catch (e) {
    clearMessage('I-001');
    if (!(e instanceof ConfigError)) throw e;
    console.error(e);
    return new Promise((resolve, reject) => {
      showMessage('E-001', { cause: CAUSES[e.kind] }, [
        { label: '再試行', onClick: () => loadConfigWithRetry(app).then(resolve, reject) },
      ]);
    });
  }
}

async function main() {
  document.getElementById('boot-reload').addEventListener('click', () => location.reload());

  const missing = checkSupport();
  if (missing.length > 0) {
    showBoot(`お使いのブラウザは、このサイトに必要な機能(${missing.join('、')})に対応していません。${BROWSERS}`);
    return;
  }

  let worker;
  try {
    worker = await checkModuleWorker(WORKER_URL);
  } catch (e) {
    console.error(e);
    showBoot(`画像の生成に必要な処理を開始できませんでした。通信状況を確認してページを再読み込みしてください。解決しない場合は、お使いのブラウザが対応していない可能性があります(${BROWSERS.replace('。', '')})。`, true);
    return;
  }

  const app = document.getElementById('app');
  initMessages(document.getElementById('messages'));
  window.addEventListener('error', (event) => handleUnexpected(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => handleUnexpected(event.reason));
  document.getElementById('boot').hidden = true;
  app.hidden = false;
  setAllDisabled(app, true);

  const config = await loadConfigWithRetry(app);
  startApp(config, worker);
}

main().catch((e) => {
  console.error(e);
  showBoot('予期しないエラーが発生しました。ページを再読み込みしてください。', true);
});
