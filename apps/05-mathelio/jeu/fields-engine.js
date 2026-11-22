(function(root){
 'use strict';
 const WIDTH=23,HEIGHT=15;
 function create(){return {rectangles:[],turn:0,dice:null,passes:0,finished:false};}
 function farm(player){return player===0?{x:0,y:0,w:3,h:3}:{x:20,y:12,w:3,h:3};}
 const tree={x:10,y:6,w:3,h:3};
 function overlaps(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
 function touches(a,b){return ((a.x+a.w===b.x||b.x+b.w===a.x)&&a.y<b.y+b.h&&a.y+a.h>b.y)||((a.y+a.h===b.y||b.y+b.h===a.y)&&a.x<b.x+b.w&&a.x+a.w>b.x);}
 function valid(g,r,player=g.turn){
  if(!r||![r.x,r.y,r.w,r.h].every(Number.isInteger)||r.w<1||r.h<1||r.x<0||r.y<0||r.x+r.w>WIDTH||r.y+r.h>HEIGHT)return false;
  if([farm(0),farm(1),tree,...g.rectangles].some(b=>overlaps(r,b)))return false;
  return [farm(player),...g.rectangles.filter(b=>b.player===player)].some(b=>touches(r,b));
 }
 function moves(g,dice=g.dice){
  if(!dice)return [];
  const result=[],sizes=dice[0]===dice[1]?[dice]:[dice,[dice[1],dice[0]]];
  for(const [w,h] of sizes)for(let y=0;y<=HEIGHT-h;y++)for(let x=0;x<=WIDTH-w;x++){const r={x,y,w,h};if(valid(g,r))result.push(r);}
  return result;
 }
 function roll(g,random=Math.random){
  if(g.finished||g.dice)throw Error('Lance les dés une seule fois par tour.');
  g.dice=[1+Math.floor(random()*6),1+Math.floor(random()*6)];return g.dice;
 }
 function next(g){g.turn=1-g.turn;g.dice=null;}
 function place(g,r,area){
  if(g.finished||!g.dice)throw Error('Lance les dés avant de placer un champ.');
  if(!((r.w===g.dice[0]&&r.h===g.dice[1])||(r.w===g.dice[1]&&r.h===g.dice[0]))||!valid(g,r))throw Error('Ce rectangle ne peut pas être placé ici.');
  if(area!==r.w*r.h)throw Error('Vérifie l’aire de ton rectangle.');
  g.rectangles.push({...r,player:g.turn,area,perimeter:2*(r.w+r.h)});g.passes=0;next(g);
 }
 function pass(g){
  if(g.finished||!g.dice||moves(g).length)throw Error('Tu peux encore placer un rectangle.');
  g.passes++;if(g.passes===2)g.finished=true;next(g);
 }
 function totals(g){return [0,1].map(player=>{const rs=g.rectangles.filter(r=>r.player===player);return {area:rs.reduce((a,r)=>a+r.area,0),perimeter:rs.reduce((a,r)=>a+r.perimeter,0),largest:Math.max(0,...rs.map(r=>r.area)),count:rs.length};});}
 function scores(g){const t=totals(g),points=[0,0],criteria={};for(const k of ['area','perimeter','largest']){criteria[k]=t.map(v=>Number(v[k]===Math.max(t[0][k],t[1][k])));points[0]+=criteria[k][0];points[1]+=criteria[k][1];}return {totals:t,criteria,points};}
 function computerMove(g,difficulty='normal',random=Math.random){
  const options=moves(g);if(!options.length)return null;
  if(difficulty==='easy')return options[Math.floor(random()*options.length)];
  // Grow towards the centre while keeping contact with our existing territory.
  const value=r=>{const centre=-Math.hypot(r.x+r.w/2-WIDTH/2,r.y+r.h/2-HEIGHT/2),contacts=g.rectangles.filter(s=>s.player===g.turn&&touches(r,s)).length*.15;if(difficulty!=='hard')return centre+contacts;const next={...g,rectangles:[...g.rectangles,{...r,player:g.turn}],dice:[2,2]};const mobility=moves(next).length;return centre+contacts+mobility*.25;};
  return options.map(r=>({r,value:value(r)})).sort((a,b)=>b.value-a.value)[0].r;
 }
 function architectShapes(area){const result=[];for(let w=1;w<=6;w++)for(let h=w;h<=6;h++)if(w*h===area)result.push({w,h,perimeter:2*(w+h)});return result;}
 function checkArchitect(area,w,h,used=[]){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>6||h>6)throw Error('Choisis deux dimensions entières de 1 à 6.');if(w*h!==area)throw Error('Cette forme n’a pas l’aire demandée. Multiplie largeur et hauteur.');if(used.some(r=>(r.w===w&&r.h===h)||(r.w===h&&r.h===w)))throw Error('Tourner le rectangle ne crée pas une nouvelle forme. Cherche d’autres dimensions.');return {w,h,perimeter:2*(w+h)};}
 const api={WIDTH,HEIGHT,tree,farm,create,overlaps,touches,valid,moves,roll,place,pass,totals,scores,computerMove,architectShapes,checkArchitect};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FieldsEngine=api;
})(globalThis);
