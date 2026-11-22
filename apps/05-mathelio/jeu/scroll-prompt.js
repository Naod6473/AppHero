// Keep the current question visible without moving the answer controls.
(()=>{
 'use strict';
 if(window.parent!==window&&window.parent.ScrollPrompt){
  const refresh=()=>parent.ScrollPrompt.refresh();
  new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
  document.addEventListener('focusin',e=>parent.ScrollPrompt.reveal(e.target,window.frameElement));
  document.addEventListener('input',e=>parent.ScrollPrompt.reveal(e.target,window.frameElement));
  window.addEventListener('pagehide',refresh);refresh();return;
 }
 const bar=document.createElement('div');bar.className='scroll-prompt';bar.hidden=true;bar.setAttribute('aria-hidden','true');document.body.append(bar);
 let queued=false,previous='';
 const visible=el=>el&&!el.closest('[hidden]')&&el.getClientRects().length>0;
 function find(doc){
  const selectors=['.game-card .calculation','.story-problem>p:first-of-type','[data-scroll-prompt]','#match #status','#game .tower-card.active .tower-total'];
  for(const selector of selectors){const el=[...doc.querySelectorAll(selector)].find(visible);if(el)return el;}return null;
 }
 // Copy text and number styling only: no duplicated IDs or interactive controls.
 function copy(node){if(node.nodeType===3)return document.createTextNode(node.textContent);const el=document.createElement('span');if(node.nodeType===1){el.className=node.className||'';if(/^(H[1-6]|P)$/.test(node.tagName))el.classList.add('scroll-prompt-line');if(node.hasAttribute('style'))el.setAttribute('style',node.getAttribute('style'));for(const child of node.childNodes)el.append(copy(child));}return el;}
 function update(){
  queued=false;let doc=document,frame=null,source=find(doc);
  if(!source){frame=document.querySelector('iframe.mini-frame');try{doc=frame?.contentDocument;source=doc&&find(doc);}catch{source=null;}}
  if(!source){bar.hidden=true;previous='';return;}
  const rect=source.getBoundingClientRect(),frameTop=frame?frame.getBoundingClientRect().top:0;
  const scope=source.closest('.game,#mini-app,#learning-app,#match,#game')||source.parentElement;
  const top=window.visualViewport?.offsetTop||0,bottom=scope.getBoundingClientRect().bottom+frameTop;
  // A partly clipped question must stay readable too (including focus scrolling).
  const show=rect.top+frameTop<top+12&&bottom>top+90;
  bar.hidden=!show;bar.style.top=top+'px';bar.classList.toggle('scroll-prompt-story',!!source.closest('.story-problem'));if(!show)return;
  const content=copy(source);content.className='scroll-prompt-content';const html=content.outerHTML;
  if(html!==previous){bar.replaceChildren(content);previous=html;}
 }
 function refresh(){if(!queued){queued=true;requestAnimationFrame(update);}}
 function reveal(input,frame){if(!input.matches?.('input:not([type="checkbox"]):not([type="range"]),textarea'))return;requestAnimationFrame(()=>{update();if(bar.hidden)return;const rect=input.getBoundingClientRect(),inputTop=rect.top+(frame?frame.getBoundingClientRect().top:0),barBottom=bar.getBoundingClientRect().bottom+12;if(inputTop<barBottom)window.scrollBy({top:inputTop-barBottom,behavior:'instant'});});}
 window.ScrollPrompt={refresh,reveal};document.addEventListener('focusin',e=>reveal(e.target));
 document.addEventListener('input',e=>reveal(e.target));
 new MutationObserver(records=>{if(records.some(r=>r.target!==bar&&!bar.contains(r.target)))refresh();}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
 document.addEventListener('load',refresh,true);window.addEventListener('scroll',refresh,{passive:true});window.addEventListener('resize',refresh);
 window.visualViewport?.addEventListener('resize',refresh);window.visualViewport?.addEventListener('scroll',refresh);refresh();
})();
