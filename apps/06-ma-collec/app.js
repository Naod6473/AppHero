// Ma Collec' · Apphéro 06/30
// Liste des 108 cartes « En route pour l'aventure ! » (cartes Disney Leclerc 2026), d'après l'album.
const NAMES=["Woody", "Buzz l'Éclair", "Fourchette", "Jessie", "Rex", "Lilypad", "Snappy", "Rouleau Pote", "Atlas", "Flash McQueen", "Cruz Ramirez", "Martin", "Sally Carrera", "M. Indestructible", "Elastigirl", "Flèche Parr", "Violette Parr", "Jack-Jack Parr", "Miguel", "Dante", "Héctor", "Ernesto de la Cruz", "Coco Rivera", "Mirabel", "Abuela Alma", "Isabela", "Antonio et Parce", "Vaiana", "Maui", "Simea", "Pua", "Heihei", "Kotu", "Loto", "Kele", "Moni", "Nemo", "Marin", "Dory", "Hank", "Crush et Squiz", "Lilo et Stitch", "Jumba Jookiba", "Pikly", "Angel", "Mulan et Cri-Kee", "Mushu", "Mulan et Li Shang", "Petit Frère", "Mulan et Khan", "Mowgli", "Baloo et Bagheera", "Junior", "Kaa", "Aladdin", "Jasmine", "Abu", "Génie", "Simba", "Nala", "Mufasa et Rafiki", "Scar", "Timon et Pumbaa", "Rémy", "Émile", "Linguini", "Colette", "Gusteau", "Marie", "Thomas O'Malley", "Duchesse", "Marie et Berlioz", "Belle", "La Bête", "Big Ben", "Lumière", "Mme Samovar et Zip", "Raiponce", "Flynn Rider", "Maximus", "Pascal", "Pongo", "Perdita", "Patch", "Rolly", "Lucky", "Peter Pan", "La Fée Clochette", "Capitaine Crochet", "Monsieur Mouche", "Elsa", "Anna", "Kristoff", "Olaf", "Bruni", "Elsa et Nokk", "Sven", "Anna et Elsa", "Olaf", "Nick Wilde", "Judy Hopps", "Chef Bogo", "Gary De'Snake", "Nibbles Maplestick", "Bob", "Sulli", "Bouh", "Germaine"];
const FILMS=[[1,9,"Toy Story"],[10,13,"Cars"],[14,18,"Les Indestructibles"],[19,23,"Coco"],[24,27,"Encanto"],[28,36,"Vaiana"],[37,41,"Le Monde de Nemo"],[42,45,"Lilo et Stitch"],[46,50,"Mulan"],[51,54,"Le Livre de la jungle"],[55,58,"Aladdin"],[59,63,"Le Roi lion"],[64,68,"Ratatouille"],[69,72,"Les Aristochats"],[73,77,"La Belle et la Bête"],[78,81,"Raiponce"],[82,86,"Les 101 Dalmatiens"],[87,90,"Peter Pan"],[91,99,"La Reine des neiges"],[100,104,"Zootopie"],[105,108,"Monstres & Cie"]];
const HUES=[35,8,350,20,300,190,205,330,0,95,265,40,15,320,280,50,215,140,200,170,105];
const FILM_OF=n=>FILMS.findIndex(f=>n>=f[0]&&n<=f[1]);
const SPECIALS=[["","Normale"],["paillettes","✨ Paillettes"],["metal","🪙 Métallisée"],["phospho","🌙 Phosphorescente"],["thermo","🔥 Thermoréactive"]];
const SP_ICON={paillettes:"✨",metal:"🪙",phospho:"🌙",thermo:"🔥"};
const END=new Date("2026-12-13T23:59:59+01:00");
const KID_HUES=[205,330,140,35,265,10];
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad3=n=>String(n).padStart(3,"0");

/* ---------- state ---------- */
// Toutes les apps partagent la même origine : clés préfixées app06_.
const KEY="app06_state";
let S;
try{S=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){S=null}
if(!S||!Array.isArray(S.kids))S={kids:[],cur:null};
let tab="album";
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){toast("Impossible d'enregistrer sur ce téléphone")}}
const kid=()=>S.kids.find(k=>k.id===S.cur)||S.kids[0];
const cnt=(k,n)=>k.counts[n]||0;
function summary(k){let own=0,dup=0;for(let n=1;n<=108;n++){const c=cnt(k,n);if(c>0)own++;if(c>1)dup+=c-1}return{own,dup,miss:108-own}}
function filmDone(k,i){const[a,b]=FILMS[i];for(let n=a;n<=b;n++)if(!cnt(k,n))return false;return true}

/* ---------- changes ---------- */
function add(n,d,quiet){const k=kid();const before=cnt(k,n);const after=Math.max(0,before+d);if(after===before)return before;
  const fi=FILM_OF(n);const wasDone=filmDone(k,fi),wasAll=summary(k).own===108;
  if(after)k.counts[n]=after;else{delete k.counts[n];delete k.special[n];photoDel(k.id,n)}
  save();
  if(!quiet){toast(d>0?(before===0?`N° ${n} ${NAMES[n-1]} : nouvelle !`:`N° ${n} : un double de plus (×${after})`):`N° ${n} : une carte retirée`)}
  if(d>0&&!wasDone&&filmDone(k,fi)){setTimeout(()=>{confetti(hsl(HUES[fi]));toast(`${k.name} a complété ${FILMS[fi][2]} !`)},quiet?400:150)}
  if(d>0&&!wasAll&&summary(k).own===108){setTimeout(()=>{confetti();confetti();toast(`Bravo ${k.name}, les 108 cartes sont réunies !`)},700)}
  render(n);return after}
function hsl(h){return`hsl(${h} 70% 55%)`}

/* ---------- render ---------- */
function renderHeader(){const k=kid(),s=summary(k);
  $("#kids").innerHTML=S.kids.map(x=>{const p=Math.round(summary(x).own/108*100);return`<button class="kid" aria-pressed="${x.id===k.id}" data-kid="${esc(x.id)}" style="--h:${x.hue}"><span class="dot">${esc(x.name[0]||"?").toUpperCase()}</span>${esc(x.name)} <span class="pct">${p} %</span></button>`}).join("")+`<button class="kid add" data-addkid>+ Enfant</button>`;
  $("#sOwn").textContent=`${s.own} / 108`;$("#sBar").style.width=(s.own/108*100)+"%";$("#sMiss").textContent=s.miss;$("#sDup").textContent=s.dup;
  $("#tMiss").textContent=s.miss;$("#tDup").textContent=s.dup;
  const days=Math.ceil((END-new Date())/864e5);
  $("#countdown").innerHTML=days>0?`Distribution en magasin<br>encore <b>${days} jour${days>1?"s":""}</b> (jusqu'au 13/12)`:`Distribution terminée<br>place aux échanges !`;
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab));
}
function sampleBanner(){return""}
function cardHTML(k,n){const c=cnt(k,n),sp=k.special[n],ph=c&&photoURL(k.id,n);return`<button class="card${c?" own":""}${ph?" ph":""}" data-n="${n}"${ph?` style="background-image:url(${ph})"`:""} aria-label="N° ${n} ${esc(NAMES[n-1])}, ${c?c+" exemplaire"+(c>1?"s":""):"manquante"}"><span class="no">${n}</span><span class="nm">${esc(NAMES[n-1])}</span>${c>1?`<span class="x">×${c}</span>`:""}${sp?`<span class="sp" title="Carte spéciale">${SP_ICON[sp]}</span>`:""}${c?`<span class="minus" data-minus="${n}" role="button" aria-label="Retirer une carte ${n}">−</span>`:""}</button>`}
function renderAlbum(){const k=kid();
  return sampleBanner()+`<p class="hint">Touchez une case pour ajouter la carte. Le « − » en retire une. Appui long pour la fiche : carte spéciale, photo.</p>`+FILMS.map(([a,b,t],i)=>{let have=0;const cells=[];for(let n=a;n<=b;n++){if(cnt(k,n))have++;cells.push(cardHTML(k,n))}const tot=b-a+1;
  return`<section class="film" style="--h:${HUES[i]}" id="film-${i}"><div class="film-h"><h2>${esc(t)}<span class="range">n° ${a} à ${b}</span></h2><span class="mini"><i style="width:${have/tot*100}%"></i></span><span class="fc${have===tot?" full":""}">${have===tot?"✓ ":""}${have}/${tot}</span></div><div class="grid">${cells.join("")}</div></section>`}).join("")}
function listBy(k,pred,fmt){return FILMS.map(([a,b,t],i)=>{const items=[];for(let n=a;n<=b;n++)if(pred(n))items.push(fmt(n,i));return items.length?`<div><h3 style="margin:0 0 6px;font-size:.9rem">${esc(t)}</h3><div class="chips">${items.join("")}</div></div>`:""}).join("")}
function renderMiss(){const k=kid(),s=summary(k);if(!s.miss)return`<div class="panel empty">🎉 Il ne manque plus rien à ${esc(k.name)} !</div>`;
  return sampleBanner()+`<div class="panel"><h2>Il manque ${s.miss} carte${s.miss>1?"s":""} à ${esc(k.name)}</h2><p class="hint">Touchez une carte trouvée pour l'ajouter.</p>${listBy(k,n=>!cnt(k,n),(n,i)=>`<button class="chip" style="--h:${HUES[i]}" data-n="${n}"><b>${n}</b>${esc(NAMES[n-1])}</button>`)}</div>`}
function renderDup(){const k=kid(),s=summary(k);if(!s.dup)return`<div class="panel empty">Pas encore de double pour ${esc(k.name)}.</div>`;
  return sampleBanner()+`<div class="panel"><h2>${s.dup} double${s.dup>1?"s":""} à échanger</h2><p class="hint">Le nombre indique combien de cartes en trop ${esc(k.name)} peut donner. Touchez-en une après un échange pour la retirer.</p>${listBy(k,n=>cnt(k,n)>1,(n,i)=>`<button class="chip" style="--h:${HUES[i]}" data-minus="${n}"><b>${n}</b>${esc(NAMES[n-1])}<span class="xx">×${cnt(k,n)-1}</span></button>`)}</div>`}
function shareText(k){const miss=[],dup=[];for(let n=1;n<=108;n++){const c=cnt(k,n);if(!c)miss.push(n);if(c>1)dup.push(c>2?`${n} (×${c-1})`:`${n}`)}
  return`Cartes Disney Leclerc 2026, collection de ${k.name} : ${108-miss.length}/108\n\nIl me manque (${miss.length}) :\n${miss.join(", ")||"rien !"}\n\nJe peux donner (${dup.length}) :\n${dup.join(", ")||"pas de double pour l'instant"}\n\nOn échange ?`}
function renderSwap(){const k=kid();const others=S.kids.filter(x=>x.id!==k.id);
  let cmp="";if(others.length){const o=others.find(x=>x.id===S.cmp)||others[0];
    const give=[],get=[];for(let n=1;n<=108;n++){if(cnt(k,n)>1&&!cnt(o,n))give.push(n);if(cnt(o,n)>1&&!cnt(k,n))get.push(n)}
    const ch=arr=>arr.length?`<div class="chips">${arr.map(n=>`<span class="chip" style="--h:${HUES[FILM_OF(n)]}"><b>${n}</b>${esc(NAMES[n-1])}</span>`).join("")}</div>`:`<p class="hint">Rien pour l'instant.</p>`;
    cmp=`<div class="panel"><h2>Entre frères et sœurs</h2><div class="row"><span>Comparer ${esc(k.name)} avec</span><select id="cmpSel">${others.map(x=>`<option value="${esc(x.id)}"${x.id===o.id?" selected":""}>${esc(x.name)}</option>`).join("")}</select></div>
    <div class="cmp"><div><h3>${esc(k.name)} peut donner à ${esc(o.name)} (${give.length})</h3>${ch(give)}</div><div><h3>${esc(o.name)} peut donner à ${esc(k.name)} (${get.length})</h3>${ch(get)}</div></div></div>`}
  return sampleBanner()+`<div class="panel"><h2>Liste d'échange de ${esc(k.name)}</h2><p class="hint">À copier dans un SMS ou un message WhatsApp pour un autre parent.</p><textarea id="shareTxt" readonly>${esc(shareText(k))}</textarea><div class="row"><button class="btn" data-copy="shareTxt">Copier le message</button></div></div>`+cmp}
function renderMore(){const k=kid();
  return`<div class="panel"><h2>Enfants</h2>${S.kids.map(x=>`<div class="row"><input type="text" id="name-${esc(x.id)}" value="${esc(x.name)}" data-rename="${esc(x.id)}" aria-label="Prénom" style="flex:1;min-width:0"><button class="btn danger small" data-del="${esc(x.id)}">Supprimer</button></div>`).join("")}<div class="row"><button class="btn ghost" data-addkid>+ Ajouter un enfant</button></div><div id="delConfirm"></div></div>
  <div class="panel"><h2>Sauvegarde</h2><p class="hint">Tout reste sur ce téléphone, sans compte. Pour changer d'appareil, téléchargez la sauvegarde (ou copiez le code) et restaurez-la sur l'autre. Les photos ne sont pas incluses.</p><textarea id="exportTxt" readonly>${esc(backup())}</textarea><div class="row"><button class="btn" data-dl>Télécharger la sauvegarde</button><button class="btn ghost" data-copy="exportTxt">Copier le code</button></div>
  <h3>Restaurer</h3><textarea id="importTxt" placeholder="Collez ici une sauvegarde" style="min-height:80px"></textarea><div class="row"><button class="btn ghost" data-import>Restaurer ce code</button><label class="btn ghost" for="importFile">Choisir un fichier</label></div></div>
  <p class="small-print">Liste des 108 cartes d'après l'album « En route pour l'aventure ! ». App indépendante, sans lien avec E.Leclerc ni Disney. Les noms des cartes servent seulement à les repérer.</p>`}
function render(focusN){document.documentElement.classList.toggle("empty-state",!S.kids.length);if(!S.kids.length){$("#view").innerHTML=renderWelcome();renderHeaderEmpty();return}renderHeader();const v=$("#view");const y=window.scrollY;
  v.innerHTML=tab==="album"?renderAlbum():tab==="miss"?renderMiss():tab==="dup"?renderDup():tab==="swap"?renderSwap():renderMore();
  window.scrollTo(0,y);
  if(focusN){const el=v.querySelector(`.card[data-n="${focusN}"]`);if(el){el.classList.add("pop")}}}

/* ---------- events ---------- */
let lp=null,lpFired=false;
$("#view").addEventListener("pointerdown",e=>{const c=e.target.closest(".card");if(!c||e.target.closest("[data-minus]"))return;lpFired=false;clearTimeout(lp);lp=setTimeout(()=>{lpFired=true;openCard(+c.dataset.n)},480)});
["pointerup","pointerleave","pointercancel","scroll"].forEach(t=>addEventListener(t,()=>clearTimeout(lp),true));
$("#view").addEventListener("contextmenu",e=>{const c=e.target.closest(".card");if(c){e.preventDefault();clearTimeout(lp);if(!lpFired)openCard(+c.dataset.n);lpFired=true}});
document.addEventListener("click",e=>{const t=e.target;
  const m=t.closest("[data-minus]");if(m){e.stopPropagation();add(+m.dataset.minus,-1);return}
  const c=t.closest("[data-n]");if(c&&c.closest("#view")){if(lpFired){lpFired=false;return}add(+c.dataset.n,1);return}
  const kb=t.closest("[data-kid]");if(kb){S.cur=kb.dataset.kid;save();render();return}
  if(t.closest("[data-addkid]")){addKid();return}
  const tb=t.closest("#tabs [data-tab]");if(tb){tab=tb.dataset.tab;render();window.scrollTo(0,0);return}
  if(t.closest("[data-start]")){const v=$("#firstName").value.trim();if(!v){toast("Écrivez le prénom de l'enfant");$("#firstName").focus();return}const k=newKid(v);S.kids.push(k);S.cur=k.id;save();tab="album";render();toast(`Album de ${k.name} prêt : touchez une case ou ouvrez une pochette`);return}
  if(t.closest("[data-dl]")){download();return}
  const cp=t.closest("[data-copy]");if(cp){copy($("#"+cp.dataset.copy));return}
  const dl=t.closest("[data-del]");if(dl){askDelete(dl.dataset.del);return}
  const dk=t.closest("[data-delok]");if(dk){const gone=dk.dataset.delok;S.kids=S.kids.filter(x=>x.id!==gone);photoDelKid(gone);if(!S.kids.find(x=>x.id===S.cur))S.cur=S.kids[0]?S.kids[0].id:null;save();render();toast("Enfant supprimé");return}
  if(t.closest("[data-delno]")){$("#delConfirm").innerHTML="";return}
  if(t.closest("[data-import]")){importText($("#importTxt").value);return}
});
document.addEventListener("change",e=>{if(e.target.id==="cmpSel"){S.cmp=e.target.value;render()}
  const r=e.target.dataset&&e.target.dataset.rename;if(r){const x=S.kids.find(k=>k.id===r);if(x){x.name=(e.target.value.trim()||x.name).slice(0,30);save();renderHeader()}}});
function newKid(name){const i=S.kids.length;return{id:"k"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:name.slice(0,30),hue:KID_HUES[i%KID_HUES.length],counts:{},special:{}}}
function addKid(){const k=newKid("Enfant "+(S.kids.length+1));S.kids.push(k);S.cur=k.id;save();tab="more";render();const inp=document.getElementById("name-"+k.id);if(inp){inp.focus();inp.select()}}
function askDelete(id){const x=S.kids.find(k=>k.id===id);$("#delConfirm").innerHTML=`<div class="sample"><span>Supprimer l'album de <b>${esc(x.name)}</b> ? Ses cartes seront effacées.</span><span class="row"><button class="btn danger small" data-delok="${esc(id)}">Supprimer</button><button class="btn ghost small" data-delno>Annuler</button></span></div>`}
async function copy(ta){try{await navigator.clipboard.writeText(ta.value);toast("Copié !")}catch(e){ta.removeAttribute("readonly");ta.focus();ta.select();toast("Texte sélectionné : copiez-le")}}
let tt;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("on"),2200)}

/* ---------- card sheet ---------- */
let cardN=0;
function openCard(n){cardN=n;const k=kid();$("#cTitle").textContent=`N° ${n} · ${NAMES[n-1]}`;$("#cFilm").textContent=`${FILMS[FILM_OF(n)][2]} · album de ${k.name}`;syncCard();$("#dCard").showModal()}
function syncCard(){const k=kid();const ph=photoURL(k.id,cardN);$("#cImg").hidden=!ph;if(ph)$("#cImg").src=ph;$("#cDelPh").hidden=!ph;$("#cFileLab").textContent=ph?"📷 Reprendre la photo":"📷 Prendre en photo";$("#cCount").textContent=cnt(k,cardN);const cur=k.special[cardN]||"";
  $("#cSp").innerHTML=SPECIALS.map(([v,l])=>`<button type="button" data-sp="${v}" aria-pressed="${cur===v}">${l}</button>`).join("")}
$("#cPlus").onclick=()=>{add(cardN,1,true);syncCard()};
$("#cMinus").onclick=()=>{add(cardN,-1,true);syncCard()};
$("#cSp").onclick=e=>{const b=e.target.closest("[data-sp]");if(!b)return;const k=kid();if(b.dataset.sp){k.special[cardN]=b.dataset.sp;if(!cnt(k,cardN))add(cardN,1,true)}else delete k.special[cardN];save();render();syncCard()};

$("#cFile").onchange=e=>{const f=e.target.files[0];e.target.value="";if(!f)return;const img=new Image(),url=URL.createObjectURL(f);img.onload=()=>{const W=240,H=320,c=document.createElement("canvas");c.width=W;c.height=H;const s=Math.max(W/img.width,H/img.height),w=img.width*s,h=img.height*s;c.getContext("2d").drawImage(img,(W-w)/2,(H-h)/2,w,h);URL.revokeObjectURL(url);const k=kid(),n=cardN;c.toBlob(b=>{if(!b){toast("Cette image ne s'ouvre pas, essayez une autre photo");return}photoPut(k.id,n,b).then(()=>{if(!cnt(k,n))add(n,1,true);render();syncCard();toast("Photo enregistrée")}).catch(()=>toast("Plus de place pour les photos sur ce téléphone"))},"image/jpeg",.75)};img.onerror=()=>toast("Cette image ne s'ouvre pas, essayez une autre photo");img.src=url};
$("#cDelPh").onclick=()=>{const k=kid();photoDel(k.id,cardN).then(()=>{render();syncCard()})};

/* ---------- pochette ---------- */
let typed="";const packLog=[];
$("#pad").innerHTML=[1,2,3,4,5,6,7,8,9,"⌫",0,"OK"].map(v=>`<button type="button" class="${v==="OK"?"go":""}" data-k="${v}">${v}</button>`).join("");
function padShow(){const n=+typed;$("#padNum").textContent=typed||"—";$("#padWho").textContent=typed?(n>=1&&n<=108?NAMES[n-1]:"Numéro inconnu"):"Numéro de 1 à 108"}
function padKey(v){if(v==="⌫")typed=typed.slice(0,-1);else if(v==="OK"){commit();return}else if(typed.length<3)typed=(typed+v).replace(/^0+/,"");padShow()}
function commit(){const n=+typed;if(!(n>=1&&n<=108)){toast("Tapez un numéro entre 1 et 108");return}const after=add(n,1,true);packLog.unshift({n,after});typed="";padShow();drawLog()}
function drawLog(){const k=kid();$("#packRes").innerHTML=packLog.map((r,i)=>`<div><span class="tag ${r.after===1?"new":"dbl"}">${r.after===1?"Nouvelle !":"Double ×"+r.after}</span><span class="t"><b>${r.n}</b> ${esc(NAMES[r.n-1])}</span><button type="button" data-undo="${i}">annuler</button></div>`).join("")||`<p class="hint">Les cartes de la pochette s'afficheront ici pour ${esc(k.name)}.</p>`}
$("#pad").onclick=e=>{const b=e.target.closest("[data-k]");if(b)padKey(String(b.dataset.k))};
$("#packRes").onclick=e=>{const b=e.target.closest("[data-undo]");if(!b)return;const r=packLog.splice(+b.dataset.undo,1)[0];add(r.n,-1,true);drawLog()};
$("#dPack").addEventListener("keydown",e=>{if(/^[0-9]$/.test(e.key)){padKey(e.key);e.preventDefault()}else if(e.key==="Backspace"){padKey("⌫");e.preventDefault()}else if(e.key==="Enter"){commit();e.preventDefault()}});
$("#fab").onclick=()=>{typed="";packLog.length=0;padShow();drawLog();$("#dPack").showModal()};
$("#packForm").addEventListener("submit",e=>{if(e.submitter&&e.submitter.value!=="close"){e.preventDefault()}});

/* ---------- confetti ---------- */
const cv=$("#fx"),cx=cv.getContext("2d");let parts=[],raf=0;
function confetti(color){if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;cv.width=innerWidth;cv.height=innerHeight;const cols=color?[color,"#ffcc33","#ffffff"]:["#ff5d8f","#ffcc33","#4f8bff","#3ccf8e","#b36bff"];
  for(let i=0;i<110;i++)parts.push({x:innerWidth/2,y:innerHeight*.35,vx:(Math.random()-.5)*14,vy:Math.random()*-12-3,r:Math.random()*6+4,c:cols[i%cols.length],a:Math.random()*6,life:120});
  if(!raf)raf=requestAnimationFrame(tick)}
function tick(){cx.clearRect(0,0,cv.width,cv.height);parts=parts.filter(p=>p.life-->0);parts.forEach(p=>{p.vy+=.35;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.a+=.2;cx.save();cx.translate(p.x,p.y);cx.rotate(p.a);cx.fillStyle=p.c;cx.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);cx.restore()});raf=parts.length?requestAnimationFrame(tick):0;if(!raf)cx.clearRect(0,0,cv.width,cv.height)}


/* ---------- accueil, sauvegarde, photos ---------- */
function renderHeaderEmpty(){$("#kids").innerHTML="";$("#countdown").innerHTML="";}
function renderWelcome(){return`<div class="panel welcome"><h2>Bienvenue !</h2><p>Ma Collec' suit l'album « En route pour l'aventure ! » des cartes Disney Leclerc 2026 : les <b>108 cartes</b>, les doubles à échanger et celles qui manquent encore.</p><p class="hint">Un album par enfant. Tout reste sur ce téléphone, sans compte.</p><label for="firstName"><b>Prénom de l'enfant</b></label><div class="row"><input type="text" id="firstName" maxlength="30" placeholder="Par exemple : Léa" autocomplete="off" style="flex:1;min-width:0"><button class="btn" data-start>Créer son album</button></div><details><summary>J'ai déjà une sauvegarde</summary><div class="panel-in"><textarea id="importTxt" placeholder="Collez ici votre sauvegarde" style="min-height:80px"></textarea><div class="row"><button class="btn ghost" data-import>Restaurer</button><label class="btn ghost" for="importFile">Choisir un fichier</label></div></div></details></div>`}
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="firstName"){e.preventDefault();document.querySelector("[data-start]").click()}});
function backup(){return JSON.stringify({app:"ma-collec",v:1,date:new Date().toISOString(),kids:S.kids})}
function download(){try{const b=new Blob([backup()],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`ma-collec-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);toast("Sauvegarde téléchargée")}catch(e){toast("Téléchargement impossible : copiez le code à la place")}}
function importText(txt){try{const d=JSON.parse(txt);if(!Array.isArray(d.kids)||!d.kids.length)throw 0;d.kids.forEach((x,i)=>{x.id=String(x.id||("k"+i));x.name=String(x.name||"Enfant").slice(0,30);x.counts=x.counts&&typeof x.counts==="object"?x.counts:{};x.special=x.special||{};x.hue=x.hue??KID_HUES[i%KID_HUES.length];delete x.photos});S={kids:d.kids,cur:d.kids[0].id};save();tab="album";render();toast("Sauvegarde restaurée")}catch(err){toast("Ce code n'est pas une sauvegarde valide")}}
document.addEventListener("change",e=>{if(e.target.id==="importFile"){const f=e.target.files[0];e.target.value="";if(f)f.text().then(importText)}});
// Photos : dans IndexedDB (trop lourdes pour localStorage), jamais envoyées.
const PH={};let dbP=null;
function db(){if(!dbP)dbP=new Promise((ok,ko)=>{const r=indexedDB.open("app06_photos",1);r.onupgradeneeded=()=>r.result.createObjectStore("p");r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)});return dbP}
function store(mode){return db().then(d=>d.transaction("p",mode).objectStore("p"))}
const req=r=>new Promise((ok,ko)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)});
function photoURL(kid,n){return PH[kid+":"+n]||""}
function photoPut(kid,n,blob){return store("readwrite").then(s=>req(s.put(blob,kid+":"+n))).then(()=>{const k=kid+":"+n;if(PH[k])URL.revokeObjectURL(PH[k]);PH[k]=URL.createObjectURL(blob)})}
function photoDel(kid,n){const k=kid+":"+n;if(!PH[k])return Promise.resolve();URL.revokeObjectURL(PH[k]);delete PH[k];return store("readwrite").then(s=>req(s.delete(k))).catch(()=>{})}
function photoDelKid(kid){Object.keys(PH).filter(k=>k.startsWith(kid+":")).forEach(k=>{const[a,b]=k.split(":");photoDel(a,+b)})}
function photoLoad(){return store("readonly").then(s=>Promise.all([req(s.getAllKeys()),req(s.getAll())])).then(([ks,vs])=>{ks.forEach((k,i)=>{PH[k]=URL.createObjectURL(vs[i])})}).catch(()=>{})}

render();
photoLoad().then(()=>{if(S.kids.length)render()});
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
