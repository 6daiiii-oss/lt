import { validateConfig } from '../server/config.js';
import { migrate, pool } from '../server/db.js';
validateConfig();
await migrate();
console.log('Migraciones aplicadas.');
await pool.end();
