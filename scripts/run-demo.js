import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
if(process.env.NODE_ENV==='production')throw new Error('Demo prohibida en producción.');
const settings=parseEnv(readFileSync('.env.demo','utf8'));
const database=new URL(settings.DATABASE_URL),name=database.pathname.slice(1);
if(!/^lote_demo_[a-f0-9]+$/.test(name))throw new Error('La demo requiere una base aislada creada por demo:seed.');
if(!['server','worker'].includes(process.argv[2]))throw new Error('Selecciona server o worker.');
// Explicitly select the isolated database even when DATABASE_URL was injected by the shell.
process.env.DATABASE_URL=database.href;process.env.STORAGE_DIR=resolve('.runtime',name,'uploads');process.env.NODE_ENV='development';
process.env.SMTP_HOST=''; // Demo accounts never send mail through an injected real SMTP service.
await import(process.argv[2]==='worker'?'../server/worker.js':'../server/index.js');
