import fs from 'fs';
import { buildIndex, match } from './matcher.mjs';
const ix=buildIndex(JSON.parse(fs.readFileSync('lib-cache.json','utf8')));
const groups={
 'roti-chapathi':['roti','rotti','chapati','chapathi','chapatti','chappati','phulka','fulka','plain roti','tawa roti'],
 'curd-rice':['curd rice','thayir sadam','thayir sadham','dahi rice','rice curd','curd  rice'],
 'fish-fry':['fish fry','meen varuval','fried fish','fish fry masala','fysh fry'],
 'chicken-biryani-v5':['chicken biryani','chicken biriyani','chiken biriyani','kozhi biryani','murgh biryani','chicken dum biryani','briyani chicken'],
};
for(const [img,names] of Object.entries(groups)){
  console.log(`\n→ ${img}`);
  for(const n of names){
    const m=match(n,ix);
    const ok=m.image===img?'ok ':'MISS';
    console.log(`   ${ok} ${n.padEnd(22)} ${(m.image??m.reason)} ${m.score?m.score.toFixed(2):''}`);
  }
}
