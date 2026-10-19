import { config, validateConfig } from './config.js';
import { migrate, pool, query } from './db.js';
import { expireReservations } from './payments.js';
import { runDueSources } from './sources.js';
import { deliverMail } from './mail.js';
import { loadSettings } from './settings.js';
validateConfig();if(!config.production) await migrate();await loadSettings();
console.log('Worker Lote iniciado: reservas, fuentes autorizadas y correo.');
let stopping=false;
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{stopping=true;});
while(!stopping) {
  try {
    await loadSettings();await expireReservations();await runDueSources();await deliverMail();
    await query('DELETE FROM sessions WHERE expires_at<now()');
  }catch(error){console.error('Fallo de ciclo de worker',error.code||error.name);}
  if(!stopping) await new Promise(resolve=>setTimeout(resolve,2000));
}
await pool.end();
