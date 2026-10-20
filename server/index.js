import { createApp } from './app.js';
import { config, validateConfig } from './config.js';
import { migrate, pool } from './db.js';
import { loadSettings } from './settings.js';
validateConfig();
if(!config.production) await migrate();
await loadSettings();
const server=createApp().listen(config.port,config.demo?'127.0.0.1':'0.0.0.0',error=>{
  if(error){console.error('No fue posible abrir el puerto del servidor',{code:error.code,port:config.port});process.exitCode=1;pool.end().catch(()=>{});return;}
  console.log(`Lote iniciado en puerto ${config.port}. Pagos reales deshabilitados.`);
});
const refresh=setInterval(()=>loadSettings().catch(()=>console.error('No se pudo refrescar configuración operativa.')),30000);refresh.unref();
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(async()=>{clearInterval(refresh);await pool.end();process.exit(0);}));
