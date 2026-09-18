import fs from 'fs';
import { buildIndex, match } from './matcher.mjs';
const base=JSON.parse(fs.readFileSync('lib-cache.json','utf8'));
const CORES=['chicken','mutton','fish','prawn','paneer','dal','veg','egg','mushroom','gobi'];
const HEADS=['biryani','fry','curry','tikka','noodles','soup','rice','kebab','salad','wrap'];
const MODS=['butter','chilli','garlic','pepper','schezwan','malai','mint','tandoori','kadai','achari'];
function grow(n){ // synthesise a realistic larger library of dish-variant names
  const out=[...base];
  let i=0;
  while(out.length<n){
    const c=CORES[i%10],h=HEADS[(i/10|0)%10],m=MODS[(i/100|0)%10];
    out.push(`${m}-${c}-${h}-${out.length}`); i++;
  }
  return out;
}
const QUERIES=['dal fry','mutton biryani','chicken 65','veg fried rice','roti','thayir sadam',
  'special chicken biryani full','ladies finger fry','kothu parotta','prawns masala fry'];
console.log(' library    build      match (avg of 10k)    p99');
for(const n of [353,1000,5000,20000,50000]){
  const names=grow(n);
  const t0=performance.now(); const ix=buildIndex(names); const build=performance.now()-t0;
  // warm
  for(let k=0;k<200;k++) match(QUERIES[k%10],ix);
  const times=[];
  for(let k=0;k<10000;k++){const a=performance.now();match(QUERIES[k%10],ix);times.push(performance.now()-a);}
  times.sort((a,b)=>a-b);
  const avg=times.reduce((s,x)=>s+x,0)/times.length;
  console.log(`  ${String(n).padStart(6)}   ${build.toFixed(0).padStart(4)}ms    ${avg.toFixed(3)}ms             ${times[Math.floor(times.length*0.99)].toFixed(3)}ms`);
}
