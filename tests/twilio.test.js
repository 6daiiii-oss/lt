import {test} from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {isolatedDatabase,fixtures} from './helpers.js';
test('Twilio normaliza el celular, envía el SMS y verifica el código usando el SID del envío',async()=>{
 const isolated=await isolatedDatabase();let db,server;const originalFetch=globalThis.fetch;let config,oldProvider;const calls=[];
 try{
  db=await import('../server/db.js');await db.migrate();const a=await fixtures(db);await db.query('UPDATE users SET phone_verified_at=NULL WHERE id=$1',[a.sellerA.userId]);
  ({config}=await import('../server/config.js'));oldProvider=config.smsProvider;config.smsProvider='twilio';process.env.TWILIO_ACCOUNT_SID='AC'+'0'.repeat(32);process.env.TWILIO_AUTH_TOKEN='test-only';process.env.TWILIO_VERIFY_SERVICE_SID='VA'+'0'.repeat(32);
  globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://verify.twilio.com/')){calls.push({url:String(url),body:Object.fromEntries(options.body)});return Response.json(String(url).endsWith('/VerificationCheck')?{status:'approved'}:{sid:'VE'+'1'.repeat(32),status:'pending'});}return originalFetch(url,options);};
  const {createApp}=await import('../server/app.js');server=createApp({testing:true}).listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,body)=>{const r=await fetch(base+'/api'+path,{method:'POST',headers:{Origin:config.origin,Cookie:a.sellerA.cookie,'X-CSRF-Token':a.sellerA.csrf,'X-Organization-Id':a.sellerA.orgId,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const sent=await request('/auth/phone/send',{phone:'977 123 456'});assert.equal(sent.status,201);assert.equal(calls[0].body.To,'+51977123456');assert.equal(calls[0].body.Channel,'sms');assert.equal(sent.data.phone,'+51977123456');
  assert.equal((await request('/auth/phone/send',{phone:'977123456'})).status,429);
  assert.equal((await request('/auth/phone/verify',{id:sent.data.id,code:'123456'})).status,200);assert.equal(calls[1].body.VerificationSid,'VE'+'1'.repeat(32));
  const user=(await db.query('SELECT phone,phone_verified_at FROM users WHERE id=$1',[a.sellerA.userId])).rows[0];assert.equal(user.phone,'+51977123456');assert.ok(user.phone_verified_at);
 }finally{globalThis.fetch=originalFetch;if(config)config.smsProvider=oldProvider;if(server)await new Promise(r=>server.close(r));if(db)await db.pool.end();await isolated.drop();}
});
