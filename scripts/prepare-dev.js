import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(process.env.NODE_ENV==='production')throw new Error('Usa npm start y migraciones explícitas para producción.');
if(!existsSync('.env')&&!process.env.DATABASE_URL){await import('./setup-local.js');process.loadEnvFile('.env');}
if(process.env.LOTE_LOCAL_DATABASE==='compose') {
  const result=spawnSync('docker',['compose','up','-d','--wait','db'],{stdio:'inherit'});
  if(result.status!==0)throw new Error('No se pudo iniciar PostgreSQL local. Comprueba Docker Desktop/Compose o configura DATABASE_URL de una instancia propia.');
}
