'use strict';
// Thème « verre coloré » : compagnons en verre, accueil, écran de calcul, réglages d'affichage.
// Couche d'interface seulement : les calculs, sauvegardes et récompenses ne changent pas.
(()=>{
 const KEY='mathelio.verre.v1',body=document.body;
 const read=()=>{try{return {glass:true,comfort:false,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return {glass:true,comfort:false};}};
 let prefs=read();
 const calm=()=>body.classList.contains('learning-calm')||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const glassOn=()=>prefs.glass&&!prefs.comfort;

 function apply(){
  body.classList.add('design-verre');
  body.classList.toggle('verre-off',!glassOn());
  body.classList.toggle('confort-lecture',!!prefs.comfort);
  swapAll(document);
 }
 function save(next){prefs={...prefs,...next};try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{}apply();}

 // Compagnons en verre : mêmes fichiers, dans assets/avatars-verre.
 const files=/assets\/avatars(-verre)?\/([a-z_]+)\/(0|strip|equipped|portrait)\.png/g;
 const swap=text=>text.replace(files,(m,v,name,file)=>`assets/avatars${glassOn()?'-verre':''}/${name}/${file}.png`);
 function swapNode(el){
  if(el.tagName==='IMG'){const src=el.getAttribute('src');if(src&&src.includes('assets/avatars')){const next=swap(src);if(next!==src)el.setAttribute('src',next);}}
  const style=el.getAttribute?.('style');if(style&&style.includes('assets/avatars')){const next=swap(style);if(next!==style)el.setAttribute('style',next);}
 }
 function swapAll(root){if(root.nodeType!==1&&root!==document)return;if(root.nodeType===1)swapNode(root);root.querySelectorAll?.('img[src*="assets/avatars"],[style*="assets/avatars"]').forEach(swapNode);}

 // Petits plaisirs : vibration et voix.
 const buzz=pattern=>{if(!calm())try{navigator.vibrate?.(pattern);}catch{}};
 const words={'+':'plus','−':'moins','-':'moins','×':'fois','÷':'divisé par','=':'égale'};
 function speak(text,button){
  if(!('speechSynthesis' in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';u.rate=.9;
  const voice=speechSynthesis.getVoices().find(v=>v.lang?.startsWith('fr'));if(voice)u.voice=voice;
  if(button){button.classList.add('speaking');u.onend=u.onerror=()=>button.classList.remove('speaking');}
  speechSynthesis.speak(u);
 }
 function sayCalculation(card){
  const calc=card.querySelector('.calculation');if(!calc)return '';
  const copy=calc.cloneNode(true);copy.querySelectorAll('.answer-slot').forEach(s=>s.remove());copy.querySelectorAll('[aria-hidden="true"]').forEach(s=>s.remove());
  let text=copy.textContent.replace(/\s+/g,' ').trim().replace(/[+−\-×÷=]/g,m=>' '+words[m]+' ').replace(/\s+/g,' ').trim();
  if(/égale\s*$/.test(text)||!/égale/.test(text))text=text.replace(/égale\s*$/,'')+' égale combien ?';
  return text;
 }

 const star='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z" fill="#ffc928" stroke="#b07a00" stroke-width="1.6" stroke-linejoin="round"/></svg>';
 function jar(filled,dropLast){
  // Dix places : les étoiles s'empilent du fond vers le haut.
  const spots=[[22,92],[38,92],[54,92],[30,80],[46,80],[22,68],[38,68],[54,68],[30,56],[46,56]];
  const stars=spots.slice(0,filled).map(([x,y],i)=>`<path class="${dropLast&&i===filled-1?'verre-star-drop':''}" transform="translate(${x-7} ${y-7}) scale(.58)" d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z" fill="#ffc928" stroke="#b07a00" stroke-width="2"/>`).join('');
  return `<svg viewBox="0 0 76 110" role="img" aria-label="${filled} étoile${filled>1?'s':''} sur 10 dans le bocal"><rect x="22" y="6" width="32" height="10" rx="4" fill="rgba(255,178,122,.9)" stroke="rgba(26,16,38,.25)"/><path d="M18 18h40c0 6 10 10 10 22v52a12 12 0 0 1-12 12H20A12 12 0 0 1 8 92V40c0-12 10-16 10-22z" fill="rgba(255,255,255,.45)" stroke="rgba(255,255,255,.95)" stroke-width="2.5"/>${stars}<path d="M16 42c0-8 4-12 8-14" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".9"/><path d="M14 52v22" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/></svg>`;
 }
 function greeting(name){
  const h=new Date().getHours(),day=new Date().toLocaleDateString('fr-FR',{weekday:'long'});
  const hello=h<5?'Bonsoir':h<12?`Bon ${day} matin`:h<18?`Bon ${day} après-midi`:'Bonsoir';
  return `${hello}, ${name} ! On fait 5 calculs ensemble ?`;
 }

 function enhanceHome(app){
  const welcome=app.querySelector('.atelier-welcome');if(!welcome||welcome.dataset.verre)return;welcome.dataset.verre='1';
  const greet=welcome.querySelector('.atelier-greeting'),h1=greet?.querySelector('h1'),mini=welcome.querySelector('.atelier-mini-companion');
  const portrait=mini?.querySelector('.portrait');const name=mini?.querySelector('h2')?.textContent||'';
  if(greet&&h1&&portrait){
   const hero=document.createElement('div');hero.className='verre-hero';
   const friend=portrait.cloneNode(true);friend.removeAttribute('role');friend.setAttribute('aria-hidden','true');
   const bubble=document.createElement('div');bubble.className='verre-bubble';
   h1.dataset.original=h1.textContent;h1.textContent=greeting(name);h1.className='verre-bubble-title';bubble.append(h1);
   hero.append(friend,bubble);greet.prepend(hero);
   greet.querySelector('.subtitle')?.setAttribute('hidden','');
  }
  if(mini){
   const strong=mini.querySelector('.starline strong'),stars=parseInt(strong?.textContent.replace(/\D+/g,'')||'0',10);
   const goal=mini.querySelector('.starline span')?.textContent||'';
   const box=document.createElement('div');box.className='verre-jar';
   let before=0;try{before=Number(sessionStorage.getItem('mathelio.jar')||stars);sessionStorage.setItem('mathelio.jar',String(stars));}catch{}
   const filled=stars>=180?10:stars%10;
   box.innerHTML=`${jar(filled,stars>before)}<div class="verre-jar-text"><span class="verre-jar-count">${stars} étoile${stars>1?'s':''}</span><span>${stars>=180?'Collection complète !':`Encore ${10-filled} pour le prochain accessoire`}</span></div>`;
   mini.querySelector('.starline')?.replaceWith(box);
   mini.querySelector('.progress')?.remove();
   mini.querySelectorAll(':scope>p').forEach(p=>p.hidden=true);
   mini.querySelector('.orbit')?.setAttribute('hidden','');mini.querySelector('h2')?.setAttribute('hidden','');
   if(goal)box.title=goal;
  }
  const activities=app.querySelector('.atelier-activities'),more=app.querySelector('.atelier-more');
  if(activities&&more){more.classList.remove('atelier-more');more.classList.add('atelier-activity');more.textContent='🗺  Carte et jeu à deux';activities.append(more);}
 }

 let lastGood=null,slotTimer=null,lastSpoken='';
 function enhanceGame(app){
  const card=app.querySelector('.game-card');if(!card)return;
  const good=card.querySelector('.feedback.good');
  if(good&&good!==lastGood&&!good.dataset.verre){good.dataset.verre='1';lastGood=good;celebrate(card);}
  const bad=card.querySelector('.feedback.bad');if(bad&&!bad.dataset.verre){bad.dataset.verre='1';buzz(40);}
  if(card.dataset.verre)return;card.dataset.verre='1';
  // Le compagnon pour les messages d'erreur.
  const sprite=card.querySelector('.atelier-game-friend .avatar-sprite');const name=sprite&&[...sprite.classList].find(c=>c.startsWith('avatar-')&&c!=='avatar-sprite')?.slice(7);
  const friendUrl=name&&`url("assets/avatars${glassOn()?'-verre':''}/${name}/0.png")`;
  if(friendUrl&&body.style.getPropertyValue('--verre-friend')!==friendUrl)body.style.setProperty('--verre-friend',friendUrl);
  // Haut-parleur.
  const calc=card.querySelector('.calculation');
  if(calc&&!card.querySelector('.verre-speak')&&'speechSynthesis' in window){
   const b=document.createElement('button');b.type='button';b.className='verre-speak';b.setAttribute('aria-label','Écouter le calcul');
   b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
   b.onclick=()=>speak(sayCalculation(card),b);calc.after(b);
   const text=sayCalculation(card);
   if(prefs.comfort&&text&&text!==lastSpoken&&!card.classList.contains('answer-reviewed')){lastSpoken=text;setTimeout(()=>speak(text,b),300);}
  }
  // La réponse s'écrit dans le calcul.
  clearInterval(slotTimer);
  const slot=card.querySelector('#answer-slot'),input=card.querySelector('#answer');
  if(slot&&input){let shown=null;const tick=()=>{if(!slot.isConnected){clearInterval(slotTimer);return;}const v=input.value;if(v===shown)return;shown=v;slot.textContent=v||'?';slot.classList.toggle('filled',!!v);slot.classList.toggle('caret',!!v);};tick();slotTimer=setInterval(tick,60);}
 }
 function celebrate(card){
  buzz([18,40,28]);
  body.classList.add('verre-success');setTimeout(()=>body.classList.remove('verre-success'),1800);
  if(calm())return;
  const from=(card.querySelector('.answer-slot')||card).getBoundingClientRect();
  for(let i=0;i<3;i++){const s=document.createElement('span');s.className='verre-fly';s.innerHTML=star;
   s.style.left=(from.left+from.width/2-17+(i-1)*24)+'px';s.style.top=(from.top+from.height/2-17)+'px';
   s.style.setProperty('--dx',(innerWidth-60-from.left-from.width/2)+'px');s.style.setProperty('--dy',(20-from.top)+'px');s.style.animationDelay=(i*.12)+'s';
   document.body.append(s);setTimeout(()=>s.remove(),1600);}
 }

 let miniTab=0;
 function enhanceMinis(app){
  const sections=[...app.querySelectorAll('.mini-catalog-section')];if(sections.length<2||app.querySelector('.verre-tabs'))return;
  const tabs=document.createElement('div');tabs.className='verre-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Choisir le type de jeu');
  const labels=['Les nombres','Jeux à plusieurs'];
  const select=i=>{miniTab=i;sections.forEach((s,j)=>s.classList.toggle('verre-tab-hidden',i!==j));[...tabs.children].forEach((b,j)=>{b.setAttribute('aria-selected',String(i===j));b.tabIndex=i===j?0:-1;});};
  labels.forEach((label,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.textContent=label;b.onclick=()=>select(i);
   b.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=1-i;select(n);tabs.children[n].focus();}};tabs.append(b);});
  sections[0].before(tabs);select(miniTab);
 }

 function enhanceSettings(app){
  const h1=app.querySelector('h1');if(!h1||h1.textContent.trim()!=='À ta façon'||app.querySelector('.verre-settings'))return;
  const panel=document.createElement('section');panel.className='panel verre-settings';
  panel.innerHTML=`<h2>Affichage</h2>
<label class="switch-row"><input type="checkbox" id="verre-glass" ${prefs.glass?'checked':''}><span>Effet verre<small>Surfaces translucides et compagnons en verre. Décoche pour un affichage plus simple, avec moins de transparence.</small></span></label>
<label class="switch-row"><input type="checkbox" id="verre-comfort" ${prefs.comfort?'checked':''}><span>Confort de lecture<small>Police plus lisible, lettres et lignes plus espacées, fond uni et calcul lu à voix haute. Pensé pour les enfants dys.</small></span></label>`;
  const anchor=h1.nextElementSibling;(anchor||h1).after(panel);
  panel.querySelector('#verre-glass').onchange=e=>save({glass:e.target.checked});
  panel.querySelector('#verre-comfort').onchange=e=>save({comfort:e.target.checked});
 }

 // Vibration légère sur le pavé numérique.
 document.addEventListener('pointerdown',e=>{if(e.target.closest?.('.keypad button'))buzz(8);},{passive:true});

 function enhance(){
  const app=document.querySelector('#app')||document.querySelector('main');
  if(app){enhanceHome(app);enhanceGame(app);enhanceMinis(app);enhanceSettings(app);}
 }
 new MutationObserver(list=>{for(const m of list){if(m.type==='attributes')swapNode(m.target);else m.addedNodes.forEach(n=>{if(n.nodeType===1)swapAll(n);});}enhance();})
  .observe(body,{subtree:true,childList:true,attributes:true,attributeFilter:['src','style']});
 apply();enhance();
 window.MathVerre={get prefs(){return {...prefs};},set:save};
})();
