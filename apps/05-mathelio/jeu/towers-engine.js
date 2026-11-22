(function(root){
 'use strict';
 const places=[1,10,100,1000,10000];
 function choices(total,die,target){return places.filter(v=>v<target&&total+die*v<=target);}
 function build(total,die,place,target){
  if(![100,1000,10000].includes(target)||!Number.isInteger(total)||total<0||total>=target||!Number.isInteger(die)||die<1||die>6||!choices(total,die,target).includes(place))throw new Error('Construction impossible');
  const next=total+die*place;
  return {total:next,won:next===target,exchanges:places.slice(0,-1).filter(v=>v>=place&&Math.floor(next/(v*10))>Math.floor(total/(v*10)))};
 }
 function digits(total,count=4){return places.slice(0,count).map(v=>Math.floor(total/v)%10);}
 function computer(total,die,target){return choices(total,die,target).at(-1)||null;}
 const api={places,choices,build,digits,computer};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.Towers=api;
})(globalThis);
