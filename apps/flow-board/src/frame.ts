/**
 * 휴대폰 틀 하나에 들어갈 문서를 만듭니다. 틀마다 저장소를 따로 두어
 * ‘첫 화면’과 ‘상세’처럼 서로 다른 상태의 같은 앱을 한 페이지에 나란히 띄울 수 있습니다.
 */
export interface FrameSetup {
  /** 이 틀에서만 쓰는 localStorage 초기값 */
  local?: Record<string, string>
  /** 이 틀에서만 쓰는 sessionStorage 초기값 */
  session?: Record<string, string>
  /** 시작 주소의 해시(보호자 웹은 #/programs/id) */
  hash?: string
}

export interface AppBundle { css: string; js: string }

/**
 * 틀 안 앱보다 먼저 도는 짧은 스크립트: 저장소를 틀 전용 메모리로 바꾸고 시작 주소를 맞춥니다.
 * srcdoc 문서의 주소는 about:srcdoc이라 ‘#/…’ 주소를 부모 페이지 기준으로 풀면 막히므로 자기 주소 기준으로 바꿔 줍니다.
 */
export function bootScript(setup: FrameSetup): string {
  const data = JSON.stringify({ local: setup.local ?? {}, session: setup.session ?? {}, hash: setup.hash ?? '' })
  return `(function(){var d=${data.replace(/</g, '\\u003c')};
function mem(init){var m=new Map(Object.entries(init));return{getItem:function(k){return m.has(k)?m.get(k):null},setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(k)},clear:function(){m.clear()},key:function(i){return Array.from(m.keys())[i]||null},get length(){return m.size}}}
try{Object.defineProperty(window,'localStorage',{value:mem(d.local),configurable:true})}catch(e){}
try{Object.defineProperty(window,'sessionStorage',{value:mem(d.session),configurable:true})}catch(e){}
['pushState','replaceState'].forEach(function(n){var o=history[n].bind(history);history[n]=function(s,t,u){if(typeof u==='string'&&u.charAt(0)==='#'){u='about:srcdoc'+u}return o(s,t,u)}});
if(d.hash){try{history.replaceState(null,'',d.hash)}catch(e){try{location.hash=d.hash}catch(e2){}}}
})();`
}

/** 틀 안 문서 전체. 스크롤 막대는 휴대폰처럼 감춥니다. */
export function frameDocument(bundle: AppBundle, setup: FrameSetup): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>${bootScript(setup)}</script>
<style>${bundle.css}</style>
<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}</style>
</head><body><div id="root"></div><script type="module">${bundle.js}</script></body></html>`
}
