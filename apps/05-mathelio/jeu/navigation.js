(()=>{
 'use strict';
 window.MathLearning?.apply();
 const button=document.querySelector('#mini-nav-mute');
 if(!button||!window.MathAudio)return;
 function update(){const muted=MathAudio.prefs.muted;button.textContent=muted?'🔇':'🔊';button.setAttribute('aria-label',muted?'Réactiver le son':'Couper le son');button.setAttribute('aria-pressed',String(muted));}
 button.onclick=()=>MathAudio.set({muted:!MathAudio.prefs.muted});document.addEventListener('preferenceschange',update);update();
})();
