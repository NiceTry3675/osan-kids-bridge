import { frameDocument, toScriptString } from './frame.js'

/** 틀 크기. 창 크기와 상관없이 늘 같습니다(휴대폰 화면 375×760 + 테두리). */
export const SCREEN = { width: 375, height: 760 }

/**
 * 휴대폰 틀 하나에 앱을 담은 페이지. 넓은 화면에서는 가운데 고정 크기 틀, 휴대폰으로 열면 틀 없이 화면 전체.
 * @param {{ title: string, label: string, css: string, js: string }} app
 */
export function shellPage({ title, label, css, js }) {
  const doc = frameDocument({ css, js })
  return `<title>${title}</title>
<meta name="color-scheme" content="light">
<style>
:root { --ink: #1d2a24; --ink-3: #66716b; --canvas: #e8ebe5; --paper: #fff; --line: #cdd3cc; color-scheme: light; }
body { margin: 0; min-height: 100vh; background: var(--canvas); color: var(--ink);
  font-family: 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif; }
.stage { min-height: 100vh; display: grid; place-content: center; justify-items: center; gap: 12px;
  padding-block: 24px 32px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.bar { width: ${SCREEN.width + 20}px; max-width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
.bar p { margin: 0; color: var(--ink-3); min-width: 0; }
.bar strong { color: var(--ink); font-weight: 700; }
.bar button { flex: none; white-space: nowrap; min-height: 36px; padding: 0 12px; border: 1.5px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer; }
.bar button:hover { border-color: var(--ink-3); }
.bar button:focus-visible { outline: 3px solid #1f7a5c; outline-offset: 2px; }
.device { flex: none; width: ${SCREEN.width}px; height: ${SCREEN.height}px; padding: 10px; border-radius: 48px; background: var(--ink);
  box-shadow: 0 30px 60px -30px rgb(29 42 36 / 45%); box-sizing: content-box; }
.device iframe { display: block; width: ${SCREEN.width}px; height: ${SCREEN.height}px; border: 0; border-radius: 38px; background: var(--paper); }
/* 휴대폰으로 열면 틀 없이 화면 전체를 씁니다. */
@media (max-width: 480px) {
  .stage { display: block; min-height: 0; padding: 0; }
  .bar { display: none; }
  .device { width: 100vw; height: 100dvh; padding: 0; border-radius: 0; box-shadow: none; box-sizing: border-box; }
  .device iframe { width: 100%; height: 100%; border-radius: 0; }
}
</style>
<div class="stage">
  <div class="bar"><p><strong>${label}</strong> 시연 · 틀 안을 끌어서 넘겨 보세요</p><button type="button" id="restart">처음부터</button></div>
  <div class="device"><iframe id="app" title="${label}"></iframe></div>
</div>
<script>
(function () {
  var doc = ${toScriptString(doc)};
  var frame = document.getElementById('app');
  function start() { frame.srcdoc = doc; }
  document.getElementById('restart').addEventListener('click', function () {
    try { frame.contentWindow.localStorage.clear(); frame.contentWindow.sessionStorage.clear(); } catch (e) {}
    frame.removeAttribute('srcdoc'); setTimeout(start, 0);
  });
  start();
})();
</script>
`
}
