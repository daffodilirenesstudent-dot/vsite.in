import fs from 'fs';
import { buildIndex, match } from './matcher.mjs';
const ENV='C:/Users/LENOVO/Desktop/buildyoustore - 2/apps/web/.env.local';
const env=Object.fromEntries(fs.readFileSync(ENV,'utf8').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).replace(/^["']|["']$/g,'')]));
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ix=buildIndex(JSON.parse(fs.readFileSync('lib-cache.json','utf8')));
let prods=[];for(let o=0;;o+=1000){const r=await fetch(`${U}/rest/v1/products?select=name&limit=1000&offset=${o}`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});const p=await r.json();prods=prods.concat(p);if(p.length<1000)break;}
const names=[...new Set(prods.map(p=>(p.name||'').trim().toLowerCase()).filter(Boolean))];
const res=names.map(n=>match(n,ix));
console.log('accept   specific   coverage   (higher accept = higher precision, lower coverage)');
for(const a of [0.55,0.65,0.75,0.85,0.95,0.999]){
  const s=res.filter(r=>r.score>=a&&r.decision!=='abstain').length;
  const g=res.filter(r=>r.decision!=='abstain').length;
  console.log(`  ${a.toFixed(2)}   ${String(s).padStart(4)} (${(100*s/names.length).toFixed(1)}%)   ${(100*g/names.length).toFixed(1)}%`);
}
