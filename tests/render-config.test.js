import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const moduleUrl=new URL('../server/config.js',import.meta.url).href;
function start(overrides={}) {
  const env={...process.env,NODE_ENV:'production',LOTE_DEMO_MODE:'false',PORT:'3000',APP_ORIGIN:'',RENDER_EXTERNAL_URL:'https://lote-example.onrender.com',DATABASE_URL:'postgresql://test:test@localhost/test',SESSION_SECRET:'a'.repeat(64),ENCRYPTION_KEY:'b'.repeat(64),SANDBOX_WEBHOOK_SECRET:'c'.repeat(64),PAYMENT_PROVIDER:'sandbox',SMS_PROVIDER:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_VERIFY_SERVICE_SID:'',SMTP_HOST:'',MAIL_FROM:'',BUSINESS_CONTACT_EMAIL:'',POLICIES_APPROVED:'false',SANDBOX_PURCHASES_ENABLED:'false',...overrides};
  return spawnSync(process.execPath,['--input-type=module','-e',`const {config,validateConfig}=await import(${JSON.stringify(moduleUrl)});validateConfig();console.log(JSON.stringify({production:config.production,smsProvider:config.smsProvider,purchasesEnabled:config.purchasesEnabled,origin:config.origin}));`],{env,encoding:'utf8'});
}
test('catálogo público arranca sin contratar SMS, correo ni aprobar políticas comerciales',()=>{
  const r=start();assert.equal(r.status,0,r.stderr);const c=JSON.parse(r.stdout);assert.equal(c.smsProvider,'disabled');assert.equal(c.purchasesEnabled,false);assert.equal(c.origin,'https://lote-example.onrender.com');
});
test('activar compras sandbox no abre compras en producción',()=>{
  const r=start({SANDBOX_PURCHASES_ENABLED:'true'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).purchasesEnabled,false);
});
test('se conserva HTTPS obligatorio y prevalece APP_ORIGIN explícito',()=>{
  assert.notEqual(start({APP_ORIGIN:'http://example.com'}).status,0);
  const r=start({APP_ORIGIN:'https://lote.example.com'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).origin,'https://lote.example.com');
});
test('elegir Twilio sigue requiriendo credenciales reales configuradas',()=>{
  const r=start({SMS_PROVIDER:'twilio'});assert.notEqual(r.status,0);assert.match(r.stderr,/Faltan credenciales de Twilio/);
});
test('no se permite el buzón SMS de desarrollo como proveedor de producción',()=>{
  assert.notEqual(start({SMS_PROVIDER:'sandbox'}).status,0);
});
test('desarrollo mantiene SMS local sin habilitar compras automáticamente',()=>{
  const r=start({NODE_ENV:'development'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).smsProvider,'sandbox');assert.equal(JSON.parse(r.stdout).purchasesEnabled,false);
});
test('siguen siendo obligatorias las claves seguras y el remitente si se configura SMTP',()=>{
  assert.notEqual(start({SESSION_SECRET:'short'}).status,0);
  assert.notEqual(start({ENCRYPTION_KEY:'invalid'}).status,0);
  assert.notEqual(start({SMTP_HOST:'smtp.example.com',MAIL_FROM:''}).status,0);
});
