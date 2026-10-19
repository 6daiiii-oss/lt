import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { config } from './config.js';
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 12 });
pool.on('error',error=>console.error('Conexión PostgreSQL inactiva perdida',{code:error.code||'connection'}));
export const query = (text, values = []) => pool.query(text, values);
export async function tx(fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
export async function migrate() {
  await tx(async db => {
    await db.query('SELECT pg_advisory_xact_lock(71822311)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
    const directory=new URL('../migrations/',import.meta.url);
    for(const file of (await readdir(directory)).filter(n=>/^\d+_.*\.sql$/.test(n)).sort()) {
      const version=Number(file.split('_')[0]),sql=await readFile(new URL(file,directory),'utf8');
      const checksum=createHash('sha256').update(sql).digest('hex');
      const prior=(await db.query('SELECT checksum FROM schema_migrations WHERE version=$1',[version])).rows[0];
      if(prior) {
        if(prior.checksum&&prior.checksum!==checksum) throw new Error(`Migración histórica modificada: ${file}`);
        if(!prior.checksum) await db.query('UPDATE schema_migrations SET checksum=$2 WHERE version=$1',[version,checksum]);
      } else {
        await db.query(sql);
        await db.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);
      }
    }
  });
}
