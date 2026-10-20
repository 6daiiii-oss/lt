import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { query, tx } from './db.js';
import { authenticated } from './auth.js';
import { phoneNumber } from './phone-format.js';
export { phoneNumber } from './phone-format.js';
import { audit, decrypt, digest, encrypt, equal, id, parse, requireThat } from './lib.js';

export function phoneVerified(req,res,next) {
  try {requireThat(req.user?.phone_verified_at,'Verifica tu número para continuar.',403,'phone_unverified');next();}catch(e){next(e);}
}
async function twilioRequest(resource,body) {
  requireThat(config.smsProvider==='twilio'&&process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_VERIFY_SERVICE_SID,'El servicio SMS aún no está configurado.',503,'sms_unavailable');
  let response,data;
  try {
    response=await fetch(`https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/${resource}`,{
      method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams(body),signal:AbortSignal.timeout(10000)});
    data=await response.json();
  }catch {requireThat(false,'El servicio SMS no responde. Intenta más tarde.',503,'sms_unavailable');}
  requireThat(response.ok,response.status===429?'Se alcanzó el límite de SMS. Intenta más tarde.':'No se pudo procesar la verificación. Solicita un código nuevo.',response.status===429?429:422,'sms_provider');
  return data;
}
export const phoneRouter=Router();
phoneRouter.use(authenticated);
phoneRouter.get('/auth/phone',async(req,res)=>{
  const pending=(await query(`SELECT id,phone,expires_at,created_at FROM phone_verifications WHERE user_id=$1 AND used_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`,[req.user.id])).rows[0];
  res.json({phone:req.user.phone||null,verified_at:req.user.phone_verified_at||null,pending:pending||null,provider:config.smsProvider,localPreview:!config.production&&config.smsProvider==='sandbox'});
});
phoneRouter.post('/auth/phone/send',async(req,res)=>{
  const {phone}=parse(z.object({phone:phoneNumber}),req.body);
  requireThat(!config.production||config.smsProvider==='twilio','SMS real pendiente de configuración.',503,'sms_unavailable');
  const result=await tx(async db=>{
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    // A DB lock also serializes different accounts targeting the same number.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[phone]);
    const stats=(await db.query(`SELECT count(*)::int AS count,max(created_at) AS latest FROM phone_verifications WHERE (user_id=$1 OR phone=$2) AND created_at>now()-interval '1 hour'`,[req.user.id,phone])).rows[0];
    requireThat(stats.count<5&&(!stats.latest||Date.now()-new Date(stats.latest).getTime()>=60000),'Espera al menos un minuto entre envíos. Máximo 5 solicitudes por hora.',429,'sms_limit');
    requireThat(!(await db.query('SELECT 1 FROM users WHERE phone=$1 AND phone_verified_at IS NOT NULL AND id<>$2',[phone,req.user.id])).rowCount,'Este número ya está vinculado a otra cuenta.',409);
    await db.query('UPDATE phone_verifications SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[req.user.id]);
    const code=config.smsProvider==='sandbox'?String(randomInt(100000,1000000)):null;
    const remote=code?null:await twilioRequest('Verifications',{To:phone,Channel:'sms',Locale:'es'});
    const row=(await db.query(`INSERT INTO phone_verifications(user_id,phone,provider,provider_sid,code_hash,sandbox_code_encrypted) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,phone,expires_at`,[req.user.id,phone,config.smsProvider,remote?.sid||null,code?digest(code):null,code?encrypt(code):null])).rows[0];
    await audit(db,req,'phone.code.requested',row.id,{provider:config.smsProvider});
    return row;
  });
  res.status(201).json({...result,message:config.smsProvider==='sandbox'?'Código generado en el buzón SMS local. No se envió un SMS real.':'Código enviado por SMS.'});
});
phoneRouter.post('/auth/phone/verify',async(req,res)=>{
  const input=parse(z.object({id,code:z.string().regex(/^\d{6}$/)}),req.body);
  // Return failures after committing attempt counters, so wrong codes cannot roll them back.
  const result=await tx(async db=>{
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    const row=(await db.query('SELECT * FROM phone_verifications WHERE id=$1 AND user_id=$2 FOR UPDATE',[input.id,req.user.id])).rows[0];
    if(!row||row.used_at||new Date(row.expires_at)<=new Date()||row.attempts>=5)return {error:'Código caducado, usado o bloqueado. Solicita otro.'};
    await db.query('UPDATE phone_verifications SET attempts=attempts+1 WHERE id=$1',[row.id]);
    let valid=false;
    if(row.provider==='sandbox') {
      requireThat(!config.production&&config.smsProvider==='sandbox','Verificación local no disponible.',403);
      valid=equal(digest(input.code),row.code_hash);
    }else {
      try {valid=(await twilioRequest('VerificationCheck',{VerificationSid:row.provider_sid,Code:input.code})).status==='approved';}
      catch {return {error:'No se pudo verificar el código. Revisa el SMS o solicita uno nuevo.'};}
    }
    if(!valid)return {error:'Código incorrecto. Tienes un máximo de 5 intentos.'};
    await db.query('UPDATE users SET phone=$2,phone_verified_at=now() WHERE id=$1',[req.user.id,row.phone]);
    if(!req.user.phone_verified_at&&req.org?.role==='owner')await db.query('UPDATE organizations SET phone=$2 WHERE id=$1',[req.org.id,row.phone]);
    await db.query('UPDATE phone_verifications SET used_at=now(),sandbox_code_encrypted=NULL WHERE user_id=$1 AND used_at IS NULL',[req.user.id]);
    await audit(db,req,'phone.verified',req.user.id);
    return {message:'Celular verificado.'};
  });
  requireThat(!result.error,result.error,422,'phone_code');res.json(result);
});
phoneRouter.get('/dev/sms',async(req,res)=>{
  requireThat(!config.production&&config.smsProvider==='sandbox','Buzón local no disponible.',404);
  const rows=(await query(`SELECT id,phone,sandbox_code_encrypted,expires_at FROM phone_verifications WHERE user_id=$1 AND provider='sandbox' AND used_at IS NULL AND expires_at>now()`,[req.user.id])).rows;
  res.json(rows.map(({sandbox_code_encrypted,...r})=>({...r,code:decrypt(sandbox_code_encrypted)})));
});
