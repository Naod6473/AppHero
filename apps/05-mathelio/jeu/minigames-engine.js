(function(root){
 'use strict';
 const random=(min,max,rng=Math.random)=>min+Math.floor(rng()*(max-min+1));
 const limits={cp:6,ce1:10,ce2:12,cm1:20,cm2:30};
 const items=[['🍎','Pomme'],['🥕','Carotte'],['🍞','Pain'],['🧀','Fromage'],['🍐','Poire'],['🍓','Fraises']];
 function raceCards(position,target,rng=Math.random){return [1,random(0,1,rng)?10:5,random(0,1,rng)?-2:random(2,6,rng)].map(delta=>({delta,legal:position+delta>=0&&position+delta<=target}));}
 function raceMove(position,delta,target){if(!Number.isInteger(delta)||!Number.isInteger(position)||position+delta<0||position+delta>target)throw Error('Cette carte dépasse la piste');return position+delta;}
 function fits(board,size,x,y,w,h){return [x,y,w,h].every(Number.isInteger)&&w>0&&h>0&&x>=0&&y>=0&&x+w<=size&&y+h<=size&&Array.from({length:h},(_,dy)=>Array.from({length:w},(_,dx)=>board[(y+dy)*size+x+dx]===0)).flat().every(Boolean);}
 function placements(board,size,w,h){const options=[];for(const [a,b] of w===h?[[w,h]]:[[w,h],[h,w]])for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(fits(board,size,x,y,a,b))options.push({x,y,w:a,h:b});return options;}
 function pave(board,size,x,y,w,h,id){if(!fits(board,size,x,y,w,h))throw Error('Le pavé doit tenir dans le jardin sans recouvrir les autres');const next=board.slice();for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)next[(y+dy)*size+x+dx]=id;return next;}
 function gardenPiece(rng=Math.random,max=3){return {w:random(1,max,rng),h:random(1,max,rng)};}
 function market(level,rng=Math.random){const shop=items.map(([icon,name],id)=>({id,icon,name,price:random(1,limits[level]|| (level==='easy'?5:12),rng)})),ids=shop.map(x=>x.id);const list=[];for(let n=0;n<3;n++){const i=random(0,ids.length-1,rng);list.push(ids.splice(i,1)[0]);}const cost=list.reduce((s,id)=>s+shop[id].price,0);return {shop,list,cost,budget:Math.ceil((cost+1)/5)*5};}
 function checkout(task,basket,paid,change){const correctBasket=basket.length===task.list.length&&task.list.every(id=>basket.filter(x=>x===id).length===1);return {correctBasket,correctPayment:Number.isInteger(paid)&&paid>=task.cost&&paid<=task.budget,correctChange:Number.isInteger(change)&&change===paid-task.cost};}
 function operation(a,op,b){if(op==='+')return a+b;if(op==='−')return a-b;if(op==='×')return a*b;throw Error('Opération inconnue');}
 function expression(cards,sequence){if(!Array.isArray(sequence)||sequence.length<1||sequence.length%2!==1)throw Error('Calcul incomplet');const used=new Set();let total;
  for(let i=0;i<sequence.length;i+=2){const index=sequence[i];if(!Number.isInteger(index)||index<0||index>=cards.length||used.has(index))throw Error('Chaque carte ne sert qu’une fois');used.add(index);total=i===0?cards[index]:operation(total,sequence[i-1],cards[index]);}return total;
 }
 function solve(cards,target){const ops=['+','−','×'];for(let a=0;a<cards.length;a++){if(cards[a]===target)return [a];for(let b=0;b<cards.length;b++)if(b!==a)for(const op of ops){if(expression(cards,[a,op,b])===target)return [a,op,b];for(let c=0;c<cards.length;c++)if(c!==a&&c!==b)for(const other of ops){const seq=[a,op,b,other,c];if(expression(cards,seq)===target)return seq;}}}return null;}
 function target(level,rng=Math.random){const cards=Array.from({length:3},()=>random(1,limits[level]|| (level==='easy'?6:12),rng));return {cards,target:['easy','cp','ce1'].includes(level)?cards[0]+cards[1]+cards[2]:(cards[0]+cards[1])*cards[2]};}
 function balance(level,rng=Math.random){const known=random(2,limits[level]|| (level==='easy'?8:20),rng),missing=random(1,limits[level]|| (level==='easy'?10:25),rng);return {known,missing,target:known+missing};}
 const api={random,items,raceCards,raceMove,fits,placements,pave,gardenPiece,market,checkout,operation,expression,solve,target,balance};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MiniGames=api;
})(globalThis);
