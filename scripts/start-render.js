import { validateConfig } from '../server/config.js';
import { migrate, pool } from '../server/db.js';

// A single Node command avoids shell quoting differences in Docker hosts.
try {
  validateConfig();
  await migrate();
  console.log('Base de datos preparada. Iniciando Lote.');
  await import('../server/index.js');
} catch (error) {
  await pool.end();
  throw error;
}
