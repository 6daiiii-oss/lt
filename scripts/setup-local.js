import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (process.env.NODE_ENV === 'production') throw new Error('Solo para desarrollo local.');
if (existsSync('.env')) {
  console.log('.env ya existe; se conserva.');
} else {
  const password = randomBytes(24).toString('hex');
  writeFileSync('.env', `NODE_ENV=development\nLOTE_LOCAL_DATABASE=compose\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://lote:${password}@127.0.0.1:5432/lote\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nSANDBOX_WEBHOOK_SECRET=${randomBytes(32).toString('hex')}\nPAYMENT_PROVIDER=sandbox\nSMS_PROVIDER=sandbox\n`, { mode: 0o600, flag: 'wx' });
  console.log('.env local creado con claves aleatorias. No se imprimieron secretos.');
}
