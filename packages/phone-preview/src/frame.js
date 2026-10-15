/**
 * 휴대폰 틀 안 문서를 만듭니다. 앱은 틀 크기(375px)를 자기 화면 너비로 보므로 휴대폰 화면 그대로 그려지고,
 * 시트(<dialog>)와 아래 고정 막대도 틀 안에 머뭅니다.
 */

/**
 * 앱보다 먼저 도는 스크립트. srcdoc 문서의 주소는 about:srcdoc이라 ‘#/…’ 주소를 부모 페이지 기준으로 풀면
 * history가 막히므로 자기 주소 기준으로 바꿔 줍니다(보호자 웹의 해시 주소용).
 */
export const BOOT_SCRIPT = `(function(){['pushState','replaceState'].forEach(function(n){var o=history[n].bind(history);
history[n]=function(s,t,u){if(typeof u==='string'&&u.charAt(0)==='#'){u='about:srcdoc'+u}return o(s,t,u)}})})();`

/**
 * 마우스로 끌어서 넘기기. 휴대폰을 손가락으로 미는 것처럼 화면이 따라오고, 놓으면 조금 더 미끄러집니다.
 * 위아래로 끌면 가장 가까운 세로 스크롤 영역(시트가 열려 있으면 시트 안)을, 옆으로 끌면 옆으로 넘어가는 줄(언어·칩)을 움직입니다.
 * 끌었을 때는 손을 뗀 자리의 버튼이 눌리지 않게 막고, 입력칸·선택 상자에서는 끌지 않습니다. 터치는 원래대로 둡니다.
 */
export const DRAG_SCRIPT = `(function(){
var drag=null,raf=0;
function canScroll(el,axis){var cs=getComputedStyle(el),o=axis==='y'?cs.overflowY:cs.overflowX;
return /(auto|scroll)/.test(o)&&(axis==='y'?el.scrollHeight>el.clientHeight+1:el.scrollWidth>el.clientWidth+1)}
function scroller(node,axis){for(var el=node;el&&el.nodeType===1&&el!==document.documentElement&&el!==document.body;el=el.parentElement){if(canScroll(el,axis))return el}
if(document.querySelector('dialog[open]'))return null;
var root=document.scrollingElement;return axis==='y'||root.scrollWidth>root.clientWidth+1?root:null}
document.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse'||e.button!==0)return;
if(e.target.closest&&e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
cancelAnimationFrame(raf);drag={x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,t:performance.now(),v:0,node:e.target,el:null,axis:null,moved:false}},true);
document.addEventListener('pointermove',function(e){if(!drag)return;
if(!drag.moved){var dx=e.clientX-drag.x0,dy=e.clientY-drag.y0;if(Math.abs(dx)<5&&Math.abs(dy)<5)return;
var axis=Math.abs(dx)>Math.abs(dy)?'x':'y',el=scroller(drag.node,axis);
if(!el&&axis==='x'){axis='y';el=scroller(drag.node,'y')}
if(!el){drag=null;return}drag.axis=axis;drag.el=el;drag.moved=true;document.documentElement.classList.add('is-dragging')}
var now=performance.now(),d=drag.axis==='y'?e.clientY-drag.y:e.clientX-drag.x,dt=Math.max(1,now-drag.t);
if(drag.axis==='y')drag.el.scrollTop-=d;else drag.el.scrollLeft-=d;
drag.v=0.8*(-d/dt)+0.2*drag.v;drag.x=e.clientX;drag.y=e.clientY;drag.t=now;e.preventDefault()},true);
function end(){if(!drag)return;var d=drag;drag=null;if(!d.moved)return;
document.documentElement.classList.remove('is-dragging');
var block=function(ev){ev.preventDefault();ev.stopPropagation();document.removeEventListener('click',block,true)};
document.addEventListener('click',block,true);setTimeout(function(){document.removeEventListener('click',block,true)},0);
var v=performance.now()-d.t>80?0:Math.max(-4,Math.min(4,d.v)),last=performance.now();
(function glide(now){var dt=now-last;last=now;if(Math.abs(v)<0.02)return;
if(d.axis==='y')d.el.scrollTop+=v*dt;else d.el.scrollLeft+=v*dt;v*=Math.pow(0.95,dt/16);raf=requestAnimationFrame(glide)})(last)}
document.addEventListener('pointerup',end,true);document.addEventListener('pointercancel',end,true);
document.addEventListener('dragstart',function(e){e.preventDefault()},true);
document.addEventListener('wheel',function(){cancelAnimationFrame(raf)},{passive:true,capture:true});
})();`

/** 틀 안 문서 전체. 스크롤 막대는 휴대폰처럼 감춥니다. */
export function frameDocument({ css, js, lang = 'ko' }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>${BOOT_SCRIPT}</script>
<style>${css}</style>
<style>html{scrollbar-width:none;cursor:grab}html::-webkit-scrollbar{display:none}*{scrollbar-width:none}*::-webkit-scrollbar{display:none}
html.is-dragging,html.is-dragging *{cursor:grabbing!important;user-select:none!important}</style>
</head><body><div id="root"></div><script>${DRAG_SCRIPT}</script><script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
}

/** 부모 페이지에 문자열로 실을 때 HTML이 끊기지 않게 합니다. */
export const toScriptString = (text) => JSON.stringify(text).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029')
