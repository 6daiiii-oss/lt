import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const portText = process.argv[2];
if (!/^\d{1,5}$/.test(portText ?? '') || Number(portText) < 1024 || Number(portText) > 65535) {
  throw new Error('Uso: npm run db:port -- 55432 (puerto entre 1024 y 65535).');
}
const text = readFileSync('.env', 'utf8');
const settings = parseEnv(text);
if (process.env.NODE_ENV === 'production' || settings.NODE_ENV === 'production' || settings.LOTE_LOCAL_DATABASE !== 'compose') {
  throw new Error('Este comando solo configura PostgreSQL local de Docker Compose.');
}
const database = new URL(settings.DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(database.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)) {
  throw new Error('DATABASE_URL debe apuntar a PostgreSQL local. No se modificó .env.');
}
const port = String(Number(portText));
database.port = port;
const newline = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?(?:DATABASE_URL|POSTGRES_PORT)\s*=/.test(line));
while (lines.at(-1) === '') lines.pop();
lines.push(`POSTGRES_PORT=${port}`, `DATABASE_URL=${database.href}`, '');
writeFileSync('.env', lines.join(newline), { mode: 0o600 });
console.log(`PostgreSQL local configurado en el puerto ${port}. Ejecuta npm run dev. Se conservan las claves y los datos.`);
