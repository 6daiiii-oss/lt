import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { isolatedDatabase,fixtures } from './helpers.js';
import { LEGAL_VERSION } from '../public/modules/legal-content.js';
let isolated,db,server,base,accounts,config;
before(async()=>{isolated=await isolatedDatabase();db=await import('../server/db.js');await db.migrate();({config}=await import('../server/config.js'));accounts=await fixtures(db);const {createApp}=await import('../server/app.js');server=createApp({testing:true}).listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.pool.end();if(isolated)await isolated.drop();});
const registration={email:'consent@demo.invalid',name:'Persona de prueba',businessName:'Marca de prueba',phone:'987654327',password:'Una-clave-de-prueba-123',kind:'seller'};
async function register(body){return fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify(body)});}
test('el consentimiento es explícito, vigente y obligatorio en el servidor; rechazo no crea cuentas',async()=>{
 for(const fields of [{},{terms_accepted:false,terms_version:LEGAL_VERSION},{terms_accepted:true,terms_version:'vieja'},{terms_accepted:'true',terms_version:LEGAL_VERSION}])assert.equal((await register({...registration,...fields})).status,422);
 assert.equal((await db.query('SELECT count(*) FROM users WHERE email=$1',[registration.email])).rows[0].count,'0');
});
test('aceptación queda versionada y auditada sin publicidad ni contraseñas; el catálogo no depende de correo verificado',async()=>{
 const response=await register({...registration,terms_accepted:true,terms_version:LEGAL_VERSION});assert.equal(response.status,201);
 const user=(await db.query('SELECT id,verified_at FROM users WHERE email=$1',[registration.email])).rows[0];assert.equal(user.verified_at,null);
 const record=(await db.query("SELECT details FROM audit_logs WHERE actor_id=$1 AND action='legal.accepted'",[user.id])).rows[0].details;
 assert.equal(record.version,LEGAL_VERSION);assert.equal(record.marketing,false);assert.equal(record.terms_sha256.length,64);assert.equal(record.privacy_sha256.length,64);
 assert.ok(!JSON.stringify(record).includes(registration.password));
});
test('exportación autenticada se limita al propio usuario y no entrega tokens, contraseñas ni datos de otro negocio',async()=>{
 assert.equal((await fetch(base+'/api/account/data-export')).status,401);
 const response=await fetch(base+'/api/account/data-export?user_id='+accounts.sellerB.userId,{headers:{Cookie:accounts.sellerA.cookie}});assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.user.id,accounts.sellerA.userId);assert.equal(data.memberships.length,1);assert.equal(data.memberships[0].organization_id,accounts.sellerA.orgId);
 assert.ok(!JSON.stringify(data).includes(accounts.sellerB.email));assert.ok(!('password_hash' in data.user));assert.ok(!JSON.stringify(data).includes(accounts.sellerA.cookie));assert.match(response.headers.get('cache-control'),/no-store/);
});
test('las condiciones no se marcan aprobadas cuando falta identificación legal',async()=>{
 const data=await (await fetch(base+'/api/legal')).json();assert.equal(data.version,LEGAL_VERSION);assert.equal(data.approved,false);
});
test('la vista de split solo permite administradores, valida proveedores y no crea movimientos',async()=>{
 const input={sellers:[{seller_id:accounts.sellerA.orgId,products_cents:100000,shipping_cents:1000},{seller_id:accounts.sellerB.orgId,products_cents:50000,shipping_cents:2000}],processing_cents:3500};
 async function preview(user,body=input){return fetch(base+'/api/admin/split-preview',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json',...(user?{Cookie:user.cookie,'X-CSRF-Token':user.csrf}:{})},body:JSON.stringify(body)});}
 assert.equal((await preview()).status,401);assert.equal((await preview(accounts.sellerA)).status,403);
 const response=await preview(accounts.admin);assert.equal(response.status,200);const plan=await response.json();assert.equal(plan.buyer_cents,156500);assert.equal(plan.executable,false);
 assert.equal((await preview(accounts.admin,{...input,sellers:[input.sellers[0],input.sellers[0]]})).status,400);
 assert.equal((await preview(accounts.admin,{...input,sellers:[{...input.sellers[0],seller_id:accounts.buyerA.orgId}]})).status,400);
 assert.equal((await db.query('SELECT count(*) FROM ledger_entries')).rows[0].count,'0');
});
