/* Pure game rules. Integers in tenths keep decimal operations exact. */
(function (root) {
  'use strict';
  const categories = {add:'Additions',sub:'Soustractions',mul:'Multiplications',div:'Divisions',mix:'Mode mixte'};
  const levels = {easy:'Facile',medium:'Moyen',hard:'Difficile'};
  const fmt = n => String(n).replace('.', ',');
  const random = (min,max,rng) => min + Math.floor(rng()*(max-min+1));
  function question(op,level,table,rng=Math.random) {
    const r=(a,b)=>random(a,b,rng); let a,b,answer,scale=1;
    if(op==='add'||op==='sub') {
      if(level==='hard'){scale=10;a=r(11,799);b=r(11,199);}
      else if(level==='easy') {a=r(1,6)*10+r(0,9);b=r(0,Math.min(9-Math.floor(a/10),3))*10+r(0,9-a%10);}
      else {a=r(35,119);b=r(11,80);if(a%10+b%10<10)b+=10-(a%10+b%10);}
      if(op==='sub') {
        if(level==='easy'){const sum=a+b;a=sum;b=sum-b;}
        else if(level==='medium'){a=r(51,199);b=r(11,a-1);if(b%10<=a%10){b=Math.floor(b/10)*10+Math.min(9,a%10+1);if(a%10===9)a--; }if(b>a)[a,b]=[b,a];}
        else if(b>a)[a,b]=[b,a];
      }
      answer=(op==='add'?a+b:a-b)/scale;a/=scale;b/=scale;
    } else {
      const tables=table?[Number(table)]:(level==='easy'?[2,5,10]:level==='medium'?[2,3,4,5,6,7,8,9]:[11,12,15,20,25]);
      b=tables[r(0,tables.length-1)];a=r(1,10);answer=a*b;
      if(op==='div'){const product=answer;answer=a;a=product;}
    }
    return {op,a,b,answer,label:`${fmt(a)} ${{add:'+',sub:'−',mul:'×',div:'÷'}[op]} ${fmt(b)}`};
  }
  function cm2Question(op,level,table,rng) {
    const r=(a,b)=>random(a,b,rng);let a,b,answer;
    const scale=level==='hard'?100:level==='medium'?10:1;
    if(op==='add'||op==='sub') {
      a=r(350,level==='easy'?1999:8999);b=r(125,level==='easy'?999:4999);
      if(op==='sub'&&b>a)[a,b]=[b,a];
      answer=(op==='add'?a+b:a-b)/scale;a/=scale;b/=scale;
    } else {
      a=r(level==='easy'?11:21,level==='hard'?99:49);
      b=table?Number(table):r(level==='easy'?2:12,level==='hard'?49:25);
      answer=a*b;if(op==='div'){const product=answer;answer=a;a=product;}
    }
    return {op,a,b,answer,label:`${fmt(a)} ${{add:'+',sub:'−',mul:'×',div:'÷'}[op]} ${fmt(b)}`};
  }
  function sixiemeQuestion(op,level,table,rng) {
    // 6e : décimaux, × et ÷ par 10, 100, 1 000 et ordre des opérations. Calculs en centièmes entiers.
    const r=(a,b)=>random(a,b,rng),c=n=>n/100,sign={add:'+',sub:'−',mul:'×',div:'÷'};
    let a,b,answer,label,hints,steps;
    if(level==='hard') {
      const x=r(2,9),y=r(2,9),prod=x*y;
      if(op==='add'){a=r(3,40);b=prod;answer=a+b;label=`${a} + ${x} × ${y}`;hints=['Attention à l’ordre : la multiplication passe avant l’addition.',`Calcule d’abord ${x} × ${y}.`];steps=[`On commence par la multiplication : ${x} × ${y} = ${prod}.`,`Puis l’addition : ${a} + ${prod} = ${answer}.`];}
      else if(op==='sub'){a=r(prod+5,prod+60);b=prod;answer=a-b;label=`${a} − ${x} × ${y}`;hints=['La multiplication passe avant la soustraction.',`Calcule d’abord ${x} × ${y}.`];steps=[`On commence par la multiplication : ${x} × ${y} = ${prod}.`,`Puis la soustraction : ${a} − ${prod} = ${answer}.`];}
      else if(op==='mul'){const s1=r(2,9),s2=r(2,9);a=s1+s2;b=x;answer=a*b;label=`(${s1} + ${s2}) × ${x}`;hints=['Les parenthèses se calculent en premier.',`Calcule d’abord ${s1} + ${s2}.`];steps=[`Les parenthèses d’abord : ${s1} + ${s2} = ${a}.`,`Puis la multiplication : ${a} × ${x} = ${answer}.`];}
      else {const k=r(2,12);a=x*k;b=x;answer=k;const s1=r(1,a-1);label=`(${s1} + ${a-s1}) ÷ ${x}`;hints=['Les parenthèses se calculent en premier.',`Calcule d’abord ${s1} + ${a-s1}.`];steps=[`Les parenthèses d’abord : ${s1} + ${a-s1} = ${a}.`,`Puis la division : ${a} ÷ ${x} = ${k}.`];}
      return {op,a,b,answer,label,hints,steps};
    }
    if(level==='easy') {
      if(op==='add'||op==='sub'){let A=r(11,999)*10,B=r(11,999)*10;if(op==='sub'&&B>A)[A,B]=[B,A];a=c(A);b=c(B);answer=c(op==='add'?A+B:A-B);}
      else if(op==='mul'){const A=r(101,9999);b=[10,100,1000][r(0,2)];a=c(A);answer=A*b/100;const n=String(b).length-1;hints=[`Multiplier par ${b}, c’est rendre le nombre ${b} fois plus grand.`,`Chaque chiffre avance de ${n} rang${n>1?'s':''} vers la gauche.`];steps=[`× ${b} : chaque chiffre avance de ${n} rang${n>1?'s':''} vers la gauche.`,`${fmt(a)} × ${b} = ${fmt(answer)}.`];}
      else {a=r(11,9999);b=[10,100][r(0,1)];answer=c(a*100/b);const n=String(b).length-1;hints=[`Diviser par ${b}, c’est rendre le nombre ${b} fois plus petit.`,`Chaque chiffre recule de ${n} rang${n>1?'s':''} vers la droite.`];steps=[`÷ ${b} : chaque chiffre recule de ${n} rang${n>1?'s':''} vers la droite.`,`${fmt(a)} ÷ ${b} = ${fmt(answer)}.`];}
    } else {
      if(op==='add'){const A=r(101,9999),B=r(11,999)*10;a=c(A);b=c(B);answer=c(A+B);hints=['Aligne les virgules : les unités sous les unités, les dixièmes sous les dixièmes.',`${fmt(b)}, c’est aussi ${fmt(b)}${String(b).includes('.')?'0':',00'}.`];}
      else if(op==='sub'){const A=r(5,50)*100,B=r(101,A-1);a=c(A);b=c(B);answer=c(A-B);hints=[`${a}, c’est aussi ${a},00.`,`Cherche ce qu’il faut ajouter à ${fmt(b)} pour arriver à ${a}.`];}
      else if(op==='mul'){const A=r(11,99);b=table?Number(table):r(2,9);a=A/10;answer=A*b/10;}
      else {const K=r(11,99);b=table?Number(table):r(2,9);answer=K/10;a=K*b/10;}
    }
    return {op,a,b,answer,label:`${fmt(a)} ${sign[op]} ${fmt(b)}`,...(hints?{hints}:{}),...(steps?{steps}:{})};
  }
  function generate(config,rng=Math.random) {
    if(config.track==='doom')return generateDoom(rng);
    if(config.track==='junior') {
      const pool=[];
      for(let a=0;a<=19;a++)for(let b=0;b<=9;b++) {
        if(config.category==='sub'||config.category==='mix') {
          if(a>=b&&(config.level==='easy'?a<=10:config.level==='medium'?a>=10&&a<=18:a<=19))pool.push({op:'sub',a,b,answer:a-b,label:`${a} − ${b}`,track:'junior'});
          if(config.category==='sub')continue;
        }
        if(config.level==='hard') {if(b===0)pool.push({op:'add',a,b:20-a,answer:20-a,complement:true,label:`${a} + ? = 20`,track:'junior'});}
        else if(a<=9&&(config.level==='easy'?a+b<=10:a+b>=10))pool.push({op:'add',a,b,answer:a+b,label:`${a} + ${b}`,track:'junior'});
      }
      for(let i=pool.length-1;i>0;i--){const j=random(0,i,rng);[pool[i],pool[j]]=[pool[j],pool[i]];}
      const count=config.mode==='challenge'?10:(config.count||5);
      const chosen=config.category==='mix'?Array.from({length:count},(_,i)=>pool.filter(q=>q.op===(i%2?'sub':'add'))[Math.floor(i/2)]):pool.slice(0,count);
      for(let i=chosen.length-1;i>0;i--){const j=random(0,i,rng);[chosen[i],chosen[j]]=[chosen[j],chosen[i]];}
      return chosen.map(q=>({...q,level:config.level}));
    }
    const result=[],seen=new Set();const ops=['add','sub','mul','div'];
    const count=config.mode==='challenge'?10:(config.count||10);
    const order=config.category==='mix'?Array.from({length:count},(_,i)=>ops[i%4]):Array(count).fill(config.category);
    for(let i=order.length-1;i>0;i--){const j=random(0,i,rng);[order[i],order[j]]=[order[j],order[i]];}
    for(const op of order){if(config.table&&result.length===10)seen.clear();let q,tries=0;do {q=['ce1','ce2'].includes(config.track)?schoolQuestion(config.track,op,config.level,config.table,rng):(config.track==='sixieme'?sixiemeQuestion:config.track==='cm2'?cm2Question:question)(op,config.level,config.table,rng);tries++;}while(seen.has(q.label)&&tries<1000);if(seen.has(q.label))throw new Error('Impossible de générer des questions distinctes');seen.add(q.label);result.push({...q,track:['ce1','ce2','cm2','sixieme'].includes(config.track)?config.track:'cm1',level:config.level});}
    return result;
  }
  function parse(value){const s=String(value).trim();return /^\d{1,6}([,.]\d{1,2})?$/.test(s)?Number(s.replace(',','.')):null;}
  function points(correct,seconds,combo){return correct?100+Math.max(0,20-Math.floor(seconds*2))+Math.min(30,Math.max(0,combo-1)*5):0;}
  function solve(q){
    if(q.track==='doom')return q.numbers.slice(1).reduce((value,n,i)=>q.operators[i]==='add'?value+n:q.operators[i]==='sub'?value-n:value*n,q.numbers[0]);
    return q.complement?20-q.a:Math.round(({add:()=>q.a+q.b,sub:()=>q.a-q.b,mul:()=>q.a*q.b,div:()=>q.a/q.b}[q.op]())*100)/100;
  }
  function schoolQuestion(track,op,level,table,rng){
    const r=(a,b)=>random(a,b,rng),ce2=track==='ce2';let a,b,answer;
    if(op==='add'||op==='sub'){
      if(level==='easy'){
        a=ce2?r(100,699):r(10,69);
        if(op==='sub'){b=r(0,a%10)+10*r(0,Math.floor(a/10)%10)+(ce2?100*r(0,Math.floor(a/100)):0);}
        else {b=r(0,9-a%10)+10*r(0,Math.min(2,9-Math.floor(a/10)%10))+(ce2?100*r(0,Math.min(2,9-Math.floor(a/100))):0);}
      }else {
        const max=ce2?(level==='hard'?10000:2000):(level==='hard'?1000:200);
        a=r(level==='hard'?(ce2?1000:100):(ce2?200:20),op==='add'?max-10:max);
        b=r(1,op==='add'?Math.min(ce2?5000:500,max-a):a);
      }
      answer=op==='add'?a+b:a-b;
    }else{
      const tables=table?[Number(table)]:level==='easy'?[2,5,10]:level==='medium'?[2,3,4,5,10]:[2,3,4,5,6,7,8,9,10];
      if(tables.some(n=>!Number.isInteger(n)||n<2||n>10))throw Error('Choisis une table de 2 à 10 pour le CE1 ou le CE2.');
      b=tables[r(0,tables.length-1)];a=ce2&&level==='hard'&&!table?r(11,99):r(1,10);answer=a*b;
      if(op==='div'){const product=answer;answer=a;a=product;}
    }
    return {op,a,b,answer,label:`${fmt(a)} ${{add:'+',sub:'−',mul:'×',div:'÷'}[op]} ${fmt(b)}`};
  }
  const schoolHelp={ce1:{easy:'Nombres jusqu’à 100, sans retenue. Tables de 2, 5 et 10 ; divisions exactes.',medium:'Additions et soustractions jusqu’à 200, avec retenues possibles. Tables de 2, 3, 4, 5 et 10.',hard:'Additions et soustractions jusqu’à 1 000. Tables de 2 à 10 et divisions exactes.'},ce2:{easy:'Nombres jusqu’à 1 000, sans retenue. Tables de 2, 5 et 10 ; divisions exactes.',medium:'Additions et soustractions jusqu’à 2 000, avec retenues possibles. Tables de 2, 3, 4, 5 et 10.',hard:'Additions et soustractions jusqu’à 10 000. Multiplication d’un nombre à deux chiffres par un facteur de 2 à 10 et divisions exactes.'}};
  function doomLabel(numbers,operators){return numbers.slice(1).reduce((label,n,i)=>`${i?'('+label+')':label} ${{add:'+',sub:'−',mul:'×'}[operators[i]]} ${n}`,String(numbers[0]));}
  function generateDoom(rng){
    const r=(a,b)=>random(a,b,rng),questions=[],seen=new Set();
    for(const kind of ['add','sub','mul','mix','add','sub','mul','mix','add','mix']){
      let q;
      for(let tries=0;tries<1000;tries++){
        let numbers,operators;
        if(kind==='add'){numbers=Array.from({length:r(2,5)},()=>r(137,2987));operators=Array(numbers.length-1).fill('add');}
        else if(kind==='sub'){numbers=[r(6000,9999),...Array.from({length:r(1,4)},()=>r(117,999))];operators=Array(numbers.length-1).fill('sub');}
        else if(kind==='mul'){numbers=[r(23,97),r(12,89)];if(r(0,1))numbers.push(r(2,5));operators=Array(numbers.length-1).fill('mul');}
        else {numbers=[r(31,89),r(12,49),r(127,899)];operators=['mul','add'];if(r(0,1)){numbers.push(r(51,199));operators.push('sub');}if(r(0,1)){numbers.push(r(2,3));operators.push('mul');}}
        q={track:'doom',level:'hard',op:kind==='mix'?'mul':kind,numbers,operators,label:doomLabel(numbers,operators)};q.answer=solve(q);
        if(!seen.has(q.label))break;
      }
      if(seen.has(q.label))throw Error('Impossible de générer le défi Doom');seen.add(q.label);questions.push(q);
    }
    for(let i=questions.length-1;i>0;i--){const j=r(0,i);[questions[i],questions[j]]=[questions[j],questions[i]];}
    return questions;
  }
  const api={categories,levels,schoolHelp,fmt,generate,parse,points,solve,doomLabel};root.MathEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
