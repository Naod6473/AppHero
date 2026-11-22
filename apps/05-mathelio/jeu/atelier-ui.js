'use strict';
// Couche d’interface de l’aperçu : le moteur et les sauvegardes restent ceux de Mathélio.
(()=>{
 const app=document.querySelector('#app');let configuring=false,portrait='',collectionTab=0;
 function button(text,action,className=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=className;b.onclick=action;return b;}
 function go(view){document.querySelector(`[data-view="${view}"]`)?.click();}
 function enhance(){
  const setup=app.querySelector('.setup');
  if(setup&&!setup.dataset.atelierReady){
   setup.dataset.atelierReady='true';document.body.classList.add('atelier-home');
   const companion=app.querySelector('.companion');portrait=companion?.querySelector('.portrait')?.outerHTML||'';
   const title=app.querySelector('h1'),sub=title?.nextElementSibling;
   const top=document.createElement('section');top.className='atelier-welcome';
   const greeting=document.createElement('div');greeting.className='atelier-greeting';if(title)greeting.append(title);if(sub){sub.textContent='Une petite séance ou une activité : à toi de choisir.';greeting.append(sub);}
   const track=setup.querySelector('#track')?.closest('label');if(track)greeting.append(track);
   top.append(greeting);if(companion){companion.classList.add('atelier-mini-companion');companion.querySelector('button')?.replaceChildren(document.createTextNode('Mes compagnons et récompenses'));top.append(companion);}
   const daily=app.querySelector('.adventure-card');if(daily){daily.classList.add('atelier-daily');daily.querySelector('h2').textContent='Ma séance du jour';daily.querySelector('.eyebrow').textContent='UN PETIT PAS CHAQUE JOUR';const extra=daily.querySelector('[data-view="adventures"]');if(extra)extra.hidden=true;}
   const activities=document.createElement('section');activities.className='atelier-activities';activities.setAttribute('aria-label','Choisir mon activité');
   const calc=button('＋  Calculs',()=>{configuring=true;setup.hidden=false;calc.setAttribute('aria-expanded','true');setup.querySelector('h2')?.focus();setup.scrollIntoView({behavior:document.body.classList.contains('learning-calm')?'auto':'smooth',block:'start'});},'atelier-activity');calc.setAttribute('aria-expanded',String(configuring));calc.setAttribute('aria-controls','atelier-calcul-options');activities.append(calc);
   activities.append(button('▤  Petits problèmes',()=>{go('adventures');app.querySelector('#stories-start')?.click();},'atelier-activity'));
   const minis=document.createElement('a');minis.href='index.html#minigames';minis.dataset.view='minigames';minis.className='atelier-activity';minis.textContent='✦  Les mini-jeux';activities.append(minis);
   app.querySelectorAll('.fields-home-card').forEach(card=>card.remove());
   setup.id='atelier-calcul-options';setup.hidden=!configuring;
   const heading=document.createElement('h2');heading.textContent='Prépare tes calculs';heading.tabIndex=-1;setup.prepend(heading);
   const advanced=document.createElement('details');advanced.className='atelier-advanced';const summary=document.createElement('summary');summary.textContent='Personnaliser ma séance';advanced.append(summary);
   const count=setup.querySelector('#count')?.closest('label');if(count)advanced.append(count);
   const modes=setup.querySelector('.modes')?.parentElement;if(modes)advanced.append(modes);
   setup.querySelector('#start')?.parentElement.before(advanced);
   const close=button('← Choisir une autre activité',()=>{configuring=false;setup.hidden=true;calc.setAttribute('aria-expanded','false');calc.focus();},'atelier-back');setup.prepend(close);
   app.prepend(top);if(daily){const action=daily.querySelector('#daily-start');if(action){action.classList.add('welcome-start');greeting.append(action);}daily.hidden=true;}(top).after(activities);const more=button('Carte des compétences et jeu à deux',()=>go('adventures'),'atelier-more');activities.after(more);
   const layout=app.querySelector('.layout');if(layout){layout.classList.add('atelier-options-layout');const aside=layout.querySelector('.aside');if(aside)aside.hidden=true;}
  }
  const avatars=app.querySelector('.avatar-options');
  if(avatars&&!app.querySelector('#profile-form')&&!avatars.dataset.tabbed){avatars.dataset.tabbed='true';const original=avatars.closest('section'),left=original.parentElement,children=[...original.childNodes];const split=children.findIndex(n=>n.nodeType===1&&n.tagName==='H2'&&n!==children[0]);const panelNodes=[children.slice(0,split),children.slice(split)];const outside=[...app.children];for(const text of ['Tes badges','Tes trophées']){const h=outside.find(n=>n.tagName==='H2'&&n.textContent.startsWith(text));panelNodes.push(h?[h,h.nextElementSibling]:[]);}
   const tabs=document.createElement('div');tabs.className='collection-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Les catégories de ta collection');const panels=panelNodes.map((nodes,i)=>{const p=document.createElement('section');p.className='panel collection-panel';p.id='collection-panel-'+i;p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby','collection-tab-'+i);nodes.filter(Boolean).forEach(n=>p.append(n));left.append(p);return p;});original.remove();
   const labels=['Compagnons','Accessoires','Badges','Trophées'];const select=i=>{collectionTab=i;panels.forEach((p,j)=>p.hidden=i!==j);[...tabs.children].forEach((b,j)=>{b.setAttribute('aria-selected',String(i===j));b.tabIndex=i===j?0:-1;});};labels.forEach((label,i)=>{const b=button(label,()=>select(i));b.id='collection-tab-'+i;b.setAttribute('role','tab');b.setAttribute('aria-controls',panels[i].id);b.onkeydown=e=>{let next=e.key==='ArrowRight'?(i+1)%4:e.key==='ArrowLeft'?(i+3)%4:e.key==='Home'?0:e.key==='End'?3:null;if(next!==null){e.preventDefault();select(next);tabs.children[next].focus();}};tabs.append(b);});app.querySelector('h1').nextElementSibling.after(tabs);select(collectionTab);
  }
  const card=app.querySelector('.game-card');
  if(card&&!card.dataset.atelierReady){
   card.dataset.atelierReady='true';document.body.classList.remove('atelier-home');
   if(portrait){const friend=document.createElement('div');friend.className='atelier-game-friend';friend.innerHTML=portrait;friend.setAttribute('aria-label','Ton compagnon t’accompagne');card.prepend(friend);}
   const hint=card.querySelector('.question-hints');if(hint||card.querySelector('.learning-tool,.count-help')){const help=document.createElement('details');help.className='atelier-help';const summary=document.createElement('summary');summary.textContent='💡 Aide-moi';help.append(summary);card.querySelectorAll('.learning-tool,.count-help').forEach(tool=>help.append(tool));if(hint)help.append(hint);if(hint?.querySelector('#question-hint-text')?.textContent.trim())help.open=true;card.querySelector('#answer-form')?.after(help);}
  }
  if(!setup&&!card)document.body.classList.remove('atelier-home');
  for(const good of app.querySelectorAll('.feedback.good'))if(!good.dataset.atelierAnimated){good.dataset.atelierAnimated='true';good.classList.add('atelier-success');}
 }
 new MutationObserver(enhance).observe(app,{childList:true,subtree:true});enhance();
})();
