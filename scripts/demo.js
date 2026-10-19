import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isolatedDatabase, fixtures } from '../tests/helpers.js';
if(existsSync('.env.demo'))throw new Error('Ya existe .env.demo. Se conserva; usa npm run demo:dev para abrir esa base.');
const isolated=await isolatedDatabase('lote_demo');
const db=await import('../server/db.js');
try {
  await db.migrate();const accounts=await fixtures(db,{withProducts:true});
  await mkdir('.runtime',{recursive:true});
  const access=Object.fromEntries(Object.entries(accounts).filter(([,a])=>a.email).map(([key,a])=>[key,{email:a.email,password:a.password}]));
  await writeFile('.runtime/demo-access.json',JSON.stringify(access,null,2),{mode:0o600,flag:'wx'});
  await writeFile('.env.demo',`DATABASE_URL=${process.env.DATABASE_URL}\nSTORAGE_DIR=.runtime/${isolated.name}/uploads\nNODE_ENV=development\n`,{mode:0o600,flag:'wx'});
  console.log('Demo creada en una base aislada. La base principal permanece vacía.');
  console.log('Accesos aleatorios en .runtime/demo-access.json (archivo privado local).');
  console.log('Inicia con npm run demo:dev y, en otra terminal, npm run demo:worker.');
  await db.pool.end();await isolated.retain();
}catch(error){await db.pool.end();await isolated.drop();throw error;}
