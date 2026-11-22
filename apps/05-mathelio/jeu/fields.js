(function(){
 'use strict';
 const S=window.MiniProgress,E=FieldsEngine,A=MathAudio,$=s=>document.querySelector(s),board=$('#board');
 function audioControls(){
  const button=$('#fields-mute');button.textContent=A.prefs.muted?'🔇':'🔊';button.setAttribute('aria-label',A.prefs.muted?'Réactiver le son':'Couper le son');button.setAttribute('aria-pressed',String(A.prefs.muted));
  $('#fields-music').checked=A.prefs.music;$('#fields-music-volume').value=Math.round(A.prefs.musicVolume*100);
 }
 $('#fields-mute').onclick=()=>A.set({muted:!A.prefs.muted});$('#fields-music').onchange=event=>A.set({music:event.target.checked});$('#fields-music-volume').oninput=event=>A.set({musicVolume:Number(event.target.value)/100});document.addEventListener('preferenceschange',audioControls);audioControls();
 function profileNavigation(){
  const link=$('#fields-profile-nav');link.textContent='Mon profil';
  try{const state=JSON.parse(localStorage.getItem('mathelio.state.v1')||'{}');const profile=state.profiles?.find(p=>p.id===state.active);const icons=['🦊','🐱','🐲','🤖','🐼','🐱','🐢','🦉','🐸','🐰','🐙','🦁','🐧','🦕','👻','🦄','🐉','🦝','🐨','🐺'];if(profile&&typeof profile.name==='string')link.textContent=`${icons[profile.avatar]||'🙂'} ${profile.name}`;}catch{}
 }
 profileNavigation();addEventListener('storage',event=>{if(event.key==='mathelio.state.v1')profileNavigation();});
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let game=null,names=[],computer=false,selection=null,rotated=false,busy=false,timer=null,calculating=0,tutorial=false,aiLevel='normal',explainAI=true,architecture=null;
 let context=null,metrics={success:0,attempts:0,aided:0};
 const levelLabel=document.createElement('label');levelLabel.innerHTML='Niveau<select id="fields-level">'+S.options()+'</select>';$('#setup-form .formrow').prepend(levelLabel);$('#name-red').value=S.profile()?.name||'Joueur 1';const saved=S.load('fields');if(saved&&saved.game&&saved.context&&S.levels[saved.context.level]){const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='Reprendre mes champs';$('#setup').prepend(button);button.onclick=()=>{({game,names,computer,tutorial,aiLevel,explainAI,context,metrics}=saved);busy=false;$('#setup').hidden=true;$('#architect-intro').hidden=true;$('#match').hidden=false;turn();};}
 function checkpoint(){if(game&&!game.finished)S.save('fields',{game,names,computer,tutorial,aiLevel,explainAI,context,metrics});}
 function rollFields(){E.roll(game,()=>S.random(context));game.dice=game.dice.map(n=>1+(n-1)%S.levels[context.level].die);}
 MiniGuide.mount('fields',$('#setup'));const suggested=new URLSearchParams(location.search).get('level')||S.preferredLevel();if(S.levels[suggested])$('#fields-level').value=suggested;
 const aiTurn=()=>computer&&game?.turn===1;
 const rectangle=(x,y)=>({x,y,w:game.dice[rotated?1:0],h:game.dice[rotated?0:1]});
 function overlay(r,classes,text,title){const el=document.createElement('div');el.className='field-overlay '+classes;el.style.cssText=`left:${r.x/E.WIDTH*100}%;top:${r.y/E.HEIGHT*100}%;width:${r.w/E.WIDTH*100}%;height:${r.h/E.HEIGHT*100}%`;el.innerHTML=NumberDisplay.html(text,{...NumberDisplay.prefs,labels:false});el.title=title;el.setAttribute('aria-hidden','true');board.append(el);}
 function draw(){
  board.replaceChildren();
  for(let y=0;y<E.HEIGHT;y++)for(let x=0;x<E.WIDTH;x++){
   const cell=document.createElement('button');cell.type='button';cell.className='field-cell';cell.dataset.x=x;cell.dataset.y=y;cell.tabIndex=x===0&&y===0?0:-1;
   const square={x,y,w:1,h:1},r=game.rectangles.find(r=>E.overlaps(r,square));
   const obstacle=[E.farm(0),E.farm(1),E.tree].find(r=>E.overlaps(r,square));
   if(r)cell.classList.add(r.player===0?'occupied-red':'occupied-blue');else if(obstacle)cell.classList.add('obstacle');
   cell.setAttribute('aria-label',`Colonne ${x+1}, ligne ${y+1}${r?`, champ de ${names[r.player]}, aire ${r.area}`:obstacle?', ferme ou arbre':', libre'}`);
   board.append(cell);
  }
  overlay(E.farm(0),'farm red','⌂','Ferme rouge');overlay(E.farm(1),'farm blue','⌂','Ferme bleue');overlay(E.tree,'tree','🌳','Arbre');
  game.rectangles.forEach(r=>overlay(r,r.player===0?'red':'blue',r.area,`${names[r.player]} : ${r.w} × ${r.h} = ${r.area}`));
  preview(selection);
 }
 function preview(r){
  const valid=r&&E.valid(game,r);
  board.querySelectorAll('.field-cell').forEach(c=>{c.classList.remove('preview','preview-invalid');if(r&&E.overlaps(r,{x:Number(c.dataset.x),y:Number(c.dataset.y),w:1,h:1}))c.classList.add(valid?'preview':'preview-invalid');});
 }
 function controls(message){checkpoint();
  const human=!aiTurn()&&!busy&&!game.finished,hasDice=!!game.dice,canPlace=hasDice&&E.moves(game).length>0;
  $('#turn-title').textContent=game.finished?'Fin de la partie':tutorial?`Découverte · tour ${game.rectangles.length+1} sur 3`:`À ${names[game.turn]} de jouer`;
  $('#status').textContent=message||(!hasDice?'Lance les dés pour découvrir ton prochain champ.':canPlace?`Rectangle de ${game.dice[0]} × ${game.dice[1]}. Choisis un emplacement.`:'Aucun emplacement possible, même en tournant le rectangle.');
  if(tutorial&&!game.finished)$('#status').textContent=['Tour 1 : lance les dés, puis place le champ contre ta ferme rouge. L’aire compte les cases : largeur × hauteur.','Tour 2 : tourne le rectangle si tu veux. Il doit toucher ta ferme ou ton premier champ par un côté, sans chevauchement.','Tour 3 : place un dernier champ. Après l’aire, calcule son périmètre : 2 × (largeur + hauteur).'][game.rectangles.length];
  $('#roll').disabled=!human||hasDice;$('#rotate').disabled=!human||!canPlace;$('#hint').disabled=!human||!canPlace;$('#pass').disabled=!human||!hasDice||canPlace;
  $('#area-form').hidden=!human||!selection;$('#confirm').disabled=!human||!selection;
  const glyphs=['⚀','⚁','⚂','⚃','⚄','⚅'];$('#dice').innerHTML=game.dice?game.dice.map(n=>`<span aria-hidden="true">${glyphs[n-1]}</span>`).join(''):'<span>?</span><span>?</span>';
  $('#dice').setAttribute('aria-label',game.dice?`Dés : ${game.dice.join(' et ')}`:'Dés non lancés');
  const totals=E.totals(game);$('#players').innerHTML=names.map((n,p)=>`<article class="fields-player ${p===0?'red':'blue'} ${!game.finished&&game.turn===p?'active':''}">${S.portrait(p)}<strong>${p===0?'Rouge':'Bleu'} · ${escape(n)}</strong><p>${totals[p].count} champ${totals[p].count>1?'s':''}</p></article>`).join('');
  NumberDisplay.decorate($('#status'));MathLearning.apply();
  if(game.dice&&!game.finished&&!aiTurn()){
   const q={a:game.dice[0],b:game.dice[1],op:'mul',track:'cm1'};
   $('#fields-learning-tools').innerHTML=MathLearning.toolsHtml(q);MathLearning.bindTools($('#fields-learning-tools'),q,()=>{metrics.aided++;checkpoint();});
  }else $('#fields-learning-tools').replaceChildren();
 }
 function choose(r){
  if(!game?.dice||busy||aiTurn()||game.finished)return;
  if(!E.valid(game,r)){selection=null;preview(r);$('#area-form').hidden=true;$('#feedback').textContent='Ce champ doit toucher ton territoire par un côté, rester dans la grille et éviter les cases occupées.';return;}
  selection=r;preview(r);$('#area').value='';$('#area-help').textContent=`Aire = largeur × hauteur = ${r.w} × ${r.h}.`;
  $('#feedback').textContent='Emplacement choisi. Calcule l’aire pour valider ton champ.';NumberDisplay.decorate($('#area-help'));controls();$('#area').focus();
 }
 function turn(message){checkpoint();
  selection=null;rotated=false;if(!tutorial)$('#tutorial-perimeter-label')?.remove();$('#feedback').textContent='';draw();controls(message);
  if(game.finished){results();return;}
  if(aiTurn()){busy=true;controls('L’ordinateur prépare son champ…');timer=setTimeout(computerTurn,650);}
 }
 function computerTurn(){
  if(!game.dice)rollFields();$('#dice').classList.add('rolling');controls('L’ordinateur a lancé les dés…');
  timer=setTimeout(()=>{const r=E.computerMove(game,aiLevel,()=>S.random(context)),why=aiLevel==='easy'?'J’ai choisi au hasard parmi les emplacements autorisés.':aiLevel==='hard'?'Je progresse vers le centre et je cherche à garder des possibilités pour de prochains champs.':'Je progresse vers le centre en restant près de mon territoire.',message=r?`L’ordinateur a placé ${r.w} × ${r.h} = ${r.w*r.h}.${explainAI?' '+why:''}`:'L’ordinateur ne peut pas placer son champ et passe son tour.';if(r)E.place(game,r,r.w*r.h);else E.pass(game);busy=false;$('#dice').classList.remove('rolling');turn(message);},900);
 }
 board.addEventListener('click',event=>{const c=event.target.closest('.field-cell');if(c&&game?.dice)choose(rectangle(Number(c.dataset.x),Number(c.dataset.y)));});
 board.addEventListener('pointerover',event=>{const c=event.target.closest('.field-cell');if(c&&game?.dice&&!selection&&!busy&&!aiTurn()&&!game.finished)preview(rectangle(Number(c.dataset.x),Number(c.dataset.y)));});
 board.addEventListener('pointerleave',()=>preview(selection));
 board.addEventListener('keydown',event=>{const c=event.target.closest('.field-cell');if(!c)return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();const x=Math.max(0,Math.min(E.WIDTH-1,Number(c.dataset.x)+delta[0])),y=Math.max(0,Math.min(E.HEIGHT-1,Number(c.dataset.y)+delta[1]));const target=board.querySelector(`[data-x="${x}"][data-y="${y}"]`);c.tabIndex=-1;target.tabIndex=0;target.focus();});
 $('#roll').onclick=()=>{if(!game||busy||aiTurn()||game.dice||game.finished)return;if(tutorial)game.dice=[[2,3],[3,2],[2,2]][game.rectangles.length];else rollFields();$('#dice').classList.add('rolling');timer=setTimeout(()=>$('#dice').classList.remove('rolling'),650);controls();};
 $('#rotate').onclick=()=>{rotated=!rotated;const old=selection;selection=null;$('#area-form').hidden=true;$('#feedback').textContent='Rectangle tourné. Choisis son emplacement.';preview(null);if(old)choose(rectangle(old.x,old.y));};
 $('#hint').onclick=()=>{metrics.aided++;checkpoint();const r=E.moves(game)[0];if(!r)return;rotated=r.w!==game.dice[0];choose(r);};
 $('#pass').onclick=()=>{const name=names[game.turn];E.pass(game);turn(`${name} passe son tour : aucun emplacement possible.`);};
 $('#area-form').onsubmit=event=>{event.preventDefault();if(!selection||busy||aiTurn())return;try{const r=selection;if((tutorial&&game.rectangles.length===2)||(!tutorial&&context.level==='cm2')){if(!$('#tutorial-perimeter')){const label=document.createElement('label');label.id='tutorial-perimeter-label';label.textContent='Périmètre de ce champ (le tour du rectangle)';label.innerHTML+='<input id="tutorial-perimeter" type="number" min="1" max="24" required inputmode="numeric">';$('#area-form').append(label);$('#feedback').textContent='Calcule aussi le périmètre : 2 × (largeur + hauteur).';$('#tutorial-perimeter').focus();return;}if(Number($('#tutorial-perimeter').value)!==2*(r.w+r.h))throw Error('Pour le périmètre, additionne les quatre côtés.');}metrics.attempts++;E.place(game,r,Number($('#area').value));metrics.success++;if(tutorial){game.turn=0;if(game.rectangles.length===3){game.finished=true;S.record('fields',context,metrics);draw();controls();$('#results').hidden=false;$('#results').innerHTML='<h2>🌾 Prêt à cultiver tes champs !</h2><p>Tu sais placer un rectangle contre ton territoire, calculer son aire et son périmètre.</p><p>L’aire compte les cases ; le périmètre mesure le tour. En partie complète, compare l’aire totale, la somme des périmètres et le plus grand rectangle.</p><button id="tutorial-done" class="primary">Choisir ma partie</button>';$('#tutorial-done').onclick=restart;return;}}turn(`Champ validé : ${r.w} × ${r.h} = ${r.w*r.h}. Au joueur suivant !`);}catch(error){$('#feedback').textContent=error.message;$('#area').focus();}};
 function scoreForm(){
  const section=$('#results');section.hidden=false;section.innerHTML=`<h2>Calculons les scores</h2><p>Au tour de <strong>${escape(names[calculating])}</strong>. Les aires sont inscrites sur les champs. Pour chaque rectangle, le périmètre vaut 2 × (largeur + hauteur).</p><details><summary>Voir mes champs pour faire les calculs</summary><div class="table-wrap"><table><thead><tr><th>Champ</th><th>Dimensions</th><th>Aire</th></tr></thead><tbody>${game.rectangles.filter(r=>r.player===calculating).map((r,i)=>`<tr><td>${i+1}</td><td>${r.w} × ${r.h}</td><td>${r.area}</td></tr>`).join('')}</tbody></table></div></details><form id="score-form" class="fields-results-form"><label>A · Aire totale<input name="area" type="number" min="0" required inputmode="numeric"></label><label>P · Périmètre total<input name="perimeter" type="number" min="0" required inputmode="numeric"></label><label>R · Plus grand champ<input name="largest" type="number" min="0" max="36" required inputmode="numeric"></label><button class="primary">Vérifier mes calculs</button></form><p id="score-feedback" role="status"></p><button id="show-scores">Voir directement les résultats</button>`;
  NumberDisplay.decorate(section);$('#show-scores').onclick=finalScores;
  $('#score-form').onsubmit=event=>{event.preventDefault();const expected=E.totals(game)[calculating],data=new FormData(event.target),labels={area:'aire totale',perimeter:'périmètre total',largest:'plus grand champ'};const errors=Object.keys(labels).filter(k=>Number(data.get(k))!==expected[k]);if(errors.length){$('#score-feedback').textContent='À revoir : '+errors.map(k=>labels[k]).join(', ')+'. Tu peux réessayer ou voir les résultats.';return;}if(calculating===0&&!computer){calculating=1;scoreForm();}else finalScores();};
 }
 function finalScores(){S.record('fields',context,metrics);const {totals,criteria,points}=E.scores(game),winner=points[0]===points[1]?'Égalité, bravo aux deux fermiers !':`${names[points[0]>points[1]?0:1]} remporte la partie !`;
  $('#results').innerHTML=`<h2 class="fields-result-heading">${escape(winner)}</h2><div class="table-wrap"><table><thead><tr><th>Critère</th>${names.map(n=>`<th>${escape(n)}</th>`).join('')}</tr></thead><tbody>${[['area','A · Aire totale'],['perimeter','P · Périmètre total'],['largest','R · Plus grand rectangle']].map(([k,label])=>`<tr><th>${label}</th>${totals.map((t,p)=>`<td>${t[k]} → ${criteria[k][p]} point</td>`).join('')}</tr>`).join('')}<tr><th>Total des points</th>${points.map(p=>`<td><strong>${p}</strong></td>`).join('')}</tr></tbody></table></div><p>Le périmètre total est la somme des périmètres de chaque rectangle, même lorsqu’ils partagent un côté.</p><button id="play-again" class="primary">Rejouer</button>`;NumberDisplay.decorate($('#results'));$('#play-again').onclick=restart;
 }
 function results(){S.record('fields',context,metrics);calculating=0;scoreForm();$('#results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
 function restart(){if(game&&!game.finished&&!confirm('Quitter cette partie et en commencer une nouvelle ?'))return;clearTimeout(timer);busy=false;game=null;selection=null;tutorial=false;$('#tutorial-perimeter-label')?.remove();$('#dice').classList.remove('rolling');$('#match').hidden=true;$('#setup').hidden=false;$('#architect-intro').hidden=false;$('#name-red').focus();}
 $('#restart').onclick=restart;
 $('#opponent').onchange=()=>{const mode=$('#opponent').value;$('#blue-label').hidden=mode!=='local';$('#name-blue').required=mode==='local';$('#ai-label').hidden=mode!=='computer';$('#ai-discovery-label').hidden=mode!=='computer';};
 $('#setup-form').onsubmit=event=>{event.preventDefault();clearTimeout(timer);computer=$('#opponent').value==='computer';tutorial=$('#opponent').value==='tutorial';aiLevel=$('#ai-level').value;explainAI=$('#ai-explain').checked;names=[$('#name-red').value.trim()||'Joueur 1',computer?'Ordinateur':$('#name-blue').value.trim()||'Joueur 2'];game=E.create();context=S.init('fields',$('#fields-level').value,new URLSearchParams(location.search).has('daily'));metrics={success:0,attempts:0,aided:0};busy=false;$('#tutorial-perimeter-label')?.remove();$('#setup').hidden=true;$('#architect-intro').hidden=true;$('#architect').hidden=true;$('#match').hidden=false;$('#results').hidden=true;if(parent===window)A.startGame();turn();$('#roll').focus();};
 function architect(){
  const {area,shapes}=architecture,complete=shapes.length===2;
  $('#architect').innerHTML=`<h2>🏗️ Une aire, plusieurs formes</h2><p>Construis ${shapes.length?'une autre forme':'un rectangle'} d’aire <strong>${area}</strong>, avec des côtés de 1 à 6. Une rotation compte comme la même forme.</p><div class="architect-shapes">${shapes.map(r=>`<article><div class="architect-rectangle" style="grid-template-columns:repeat(${r.w},1fr);width:${r.w*28}px" aria-label="Rectangle de ${r.w} sur ${r.h}">${'<span></span>'.repeat(r.w*r.h)}</div><p>${r.w} × ${r.h} = ${area}<br>Périmètre : ${r.perimeter}</p></article>`).join('')}</div>${complete?`<p class="feedback good">Même aire, deux formes ! Les périmètres sont ${shapes.map(r=>r.perimeter).join(' et ')}. Le rectangle ${shapes.reduce((a,b)=>a.perimeter<b.perimeter?a:b).w} × ${shapes.reduce((a,b)=>a.perimeter<b.perimeter?a:b).h} a le plus petit périmètre.</p><button id="architect-next" class="primary">Un autre défi</button>`:`<form id="architect-form"><div class="formrow"><label>Largeur<input name="width" type="number" min="1" max="6" required></label><label>Hauteur<input name="height" type="number" min="1" max="6" required></label><label>Périmètre<input name="perimeter" type="number" min="4" max="24" required></label></div><p class="muted">Aire = largeur × hauteur. Périmètre = 2 × (largeur + hauteur).</p><button class="primary">Vérifier ma construction</button></form><p id="architect-feedback" role="status"></p>`}<button id="architect-close" class="spaced">Retour aux champs</button>`;
  if($('#architect-form'))$('#architect-form').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target);try{const r=E.checkArchitect(area,Number(data.get('width')),Number(data.get('height')),shapes);if(Number(data.get('perimeter'))!==r.perimeter)throw Error('L’aire est bonne. Pour le périmètre, additionne les quatre côtés.');shapes.push(r);architect();}catch(error){$('#architect-feedback').textContent=error.message;}};
  if($('#architect-next'))$('#architect-next').onclick=()=>{architecture={area:[4,6,12][([4,6,12].indexOf(area)+1)%3],shapes:[]};architect();};
  $('#architect-close').onclick=()=>{$('#architect').hidden=true;$('#setup').hidden=false;$('#architect-intro').hidden=false;$('#architect-start').focus();};
 }
 $('#architect-start').onclick=()=>{if(parent===window)A.startGame();architecture={area:12,shapes:[]};$('#setup').hidden=true;$('#architect-intro').hidden=true;$('#architect').hidden=false;architect();};
 $('#fields-number-settings').innerHTML=NumberDisplay.settingsHtml()+MathLearning.settingsHtml();NumberDisplay.bindSettings($('#fields-number-settings'),()=>{MathLearning.apply();if(game){draw();NumberDisplay.decorate($('#area-help'));}});MathLearning.bindSettings($('#fields-number-settings'),()=>{if(game)controls();});MathLearning.apply();
 addEventListener('pagehide',checkpoint);
})();
