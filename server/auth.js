import { Router } from 'express';
import { phoneNumber } from './phone-format.js';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { LEGAL_VERSION,legalDocuments } from '../public/modules/legal-content.js';
import { query, tx } from './db.js';
import { config, demoEnabled } from './config.js';
import { audit, digest, email, equal, hash, id, parse, passwordHash, passwordMatches, requireThat, text, token } from './lib.js';

export async function identify(req,res,next) {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      requireThat(req.path==='/seller/catalog/upsert'&&req.method==='POST','La clave solo autoriza sincronización de catálogo.',403);
      const key=(await query(`SELECT k.*,u.email,u.verified_at,u.phone,u.phone_verified_at FROM api_keys k JOIN users u ON u.id=k.user_id
        WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,[digest(req.headers.authorization.slice(7))])).rows[0];
      requireThat(key,'Clave inválida.',401);
      req.apiKey=key; req.user={id:key.user_id,email:key.email,verified_at:key.verified_at,is_admin:false,phone:key.phone,phone_verified_at:key.phone_verified_at};
    } else {
      const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(config.cookieName+'='))?.slice(config.cookieName.length+1);
      if (raw && /^[a-f0-9]{64}$/.test(raw)) {
        const session=(await query(`SELECT s.*,u.email,u.name,u.verified_at,u.is_admin,u.phone,u.phone_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND expires_at>now()`,[digest(raw)])).rows[0];
        if (session) { req.session=session; req.user={id:session.user_id,email:session.email,name:session.name,verified_at:session.verified_at,is_admin:session.is_admin,phone:session.phone,phone_verified_at:session.phone_verified_at}; }
      }
    }
    if (req.user) {
      const selected=req.apiKey?.organization_id||req.headers['x-organization-id'];
      if (selected) id.parse(selected);
      const orgs=(await query(`SELECT o.*,m.role,b.id AS brand_id FROM memberships m JOIN organizations o ON o.id=m.organization_id LEFT JOIN brands b ON b.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.created_at`,[req.user.id])).rows;
      req.organizations=orgs;
      req.org=selected?orgs.find(o=>o.id===selected):orgs[0];
      if (selected) requireThat(req.org,'Organización no autorizada.',403);
    }
    next();
  } catch(e) { next(e); }
}
export function authenticated(req,res,next) { try { requireThat(req.user,'Inicia sesión.',401); next(); } catch(e){next(e);} }
export function verified(req,res,next) { try { requireThat(req.user?.is_admin?req.user.verified_at:req.user?.phone_verified_at,'Verifica tu número para continuar.',403,'phone_unverified'); next(); } catch(e){next(e);} }
export function orgRole(kind,{approved=false,owner=false}={}) {
  return (req,res,next)=>{ try {
    requireThat(req.user,'Inicia sesión.',401);
    requireThat(req.org?.kind===kind,'No tienes acceso a este panel.',403);
    requireThat(req.org.status!=='suspended','Organización suspendida.',403);
    if (owner) requireThat(req.org.role==='owner','Requiere titular de organización.',403);
    if (approved) requireThat(req.org.status==='approved','Tu negocio debe ser verificado.',403,'business_unverified');
    next();
  }catch(e){next(e);} };
}
export function admin(req,res,next) { try { requireThat(req.user?.is_admin&&req.user?.verified_at,'Acceso administrativo requerido.',403); next(); } catch(e){next(e);} }
export function csrf(req,res,next) {
  try {
    if (['GET','HEAD','OPTIONS'].includes(req.method)||req.path.startsWith('/webhooks/')) return next();
    if(req.apiKey) return next();
    requireThat(req.headers.origin===config.origin,'Origen de solicitud inválido.',403,'origin');
    if (req.session) requireThat(equal(req.headers['x-csrf-token'],req.session.csrf_token),'Token CSRF inválido.',403,'csrf');
    next();
  }catch(e){next(e);}
}
async function createSession(db,req,res,userId) {
  if(req.session) await db.query('DELETE FROM sessions WHERE token_hash=$1',[req.session.token_hash]);
  const raw=token();
  await db.query(`INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '7 days')`,[digest(raw),userId,token()]);
  res.cookie(config.cookieName,raw,{httpOnly:true,secure:config.production,sameSite:'lax',maxAge:7*24*3600*1000,path:'/'});
}
async function accountEmail(db,user,purpose) {
  requireThat(!config.production||(process.env.SMTP_HOST&&process.env.MAIL_FROM),'El envío de correos todavía no está habilitado. Contacta con soporte para recuperar el acceso.',503,'mail_unavailable');
  const raw=token();
  await db.query(`UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL`,[user.id,purpose]);
  await db.query(`INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')`,[digest(raw),user.id,purpose]);
  const url=`${config.origin}/${purpose==='verify'?'verificar':'restablecer'}?token=${raw}`;
  await db.query('INSERT INTO mail_outbox(user_id,subject,body) VALUES($1,$2,$3)',[user.id,purpose==='verify'?'Verifica tu correo en Lote':'Recupera tu acceso a Lote',`Este enlace es de un uso y caduca en 30 minutos.\n${url}`]);
}
export const authRouter=Router();
const accountLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Demasiados intentos. Prueba más tarde.'}});
authRouter.get('/demo/info',(req,res)=>res.json({enabled:demoEnabled(),available:!config.production&&['localhost','127.0.0.1'].includes(req.hostname)}));
authRouter.post('/demo/login',accountLimit,async(req,res)=>{
  requireThat(demoEnabled(),'La demo solo permite cuentas de ejemplo en su base aislada.',404);
  const {role}=parse(z.object({role:z.enum(['buyerA','sellerA','sellerB','admin'])}),req.body);
  const user=(await query('SELECT id FROM users WHERE email=$1',[role.toLowerCase()+'@demo.invalid'])).rows[0];
  requireThat(user,'Prepara primero las cuentas de ejemplo.',404);
  await tx(db=>createSession(db,req,res,user.id));res.json({message:'Cuenta de ejemplo lista.'});
});
authRouter.post('/auth/register',accountLimit,async(req,res)=>{
  parse(z.object({terms_accepted:z.literal(true,{error:'Acepta las condiciones para crear tu cuenta.'}),terms_version:z.literal(LEGAL_VERSION,{error:'Actualiza la página para leer la versión vigente de las condiciones.'})}),req.body);
  const input=parse(z.object({email,password:z.string().min(12).max(128),name:text,businessName:text,phone:phoneNumber,legal_name:z.string().trim().max(500).default(''),tax_id:z.string().trim().regex(/^(?:[0-9]{11})?$/,'El RUC debe tener 11 dígitos.').default(''),kind:z.enum(['buyer','seller'])}),req.body);
  const encoded=await passwordHash(input.password);
  await tx(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[input.phone]);
    requireThat(!(await db.query('SELECT 1 FROM users WHERE phone=$1 AND phone_verified_at IS NOT NULL',[input.phone])).rowCount,'Este número ya tiene una cuenta verificada. Inicia sesión.',409);
    const user=(await db.query('INSERT INTO users(email,name,password_hash,phone) VALUES($1,$2,$3,$4) RETURNING id,email',[input.email,input.name,encoded,input.phone])).rows[0];
    const org=(await db.query('INSERT INTO organizations(name,kind,contact_email,phone,legal_name,tax_id,business_type) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[input.businessName,input.kind,input.email,input.phone,input.legal_name||input.name,input.tax_id,input.kind==='seller'?'Proveedor':'Tienda'])).rows[0];
    await db.query(`INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,'owner')`,[user.id,org.id]);
    if(input.kind==='seller') await db.query('INSERT INTO brands(organization_id,name) VALUES($1,$2)',[org.id,input.businessName]);
    await createSession(db,req,res,user.id);
    await audit(db,{user,org},'account.register',user.id,{kind:input.kind});
    await audit(db,{user,org},'legal.accepted',user.id,{version:LEGAL_VERSION,terms_sha256:hash(JSON.stringify(legalDocuments.terms)),privacy_sha256:hash(JSON.stringify(legalDocuments.privacy)),purpose:'account_and_catalog',marketing:false});
  });
  res.status(201).json({message:'Datos guardados. Verifica tu número para completar el registro.'});
});
authRouter.post('/auth/login',accountLimit,async(req,res)=>{
  const input=parse(z.object({email,password:z.string().max(128)}),req.body);
  const user=(await query('SELECT * FROM users WHERE email=$1',[input.email])).rows[0];
  // Fixed-cost derivation even when the address does not exist.
  const valid=await passwordMatches(input.password,user?.password_hash||`scrypt$65536$8$1$00000000000000000000000000000000$${'0'.repeat(128)}`);
  requireThat(user&&valid,'Correo o contraseña incorrectos.',401);
  await tx(db=>createSession(db,req,res,user.id));
  res.json({message:'Sesión iniciada.'});
});
authRouter.post('/auth/logout',authenticated,async(req,res)=>{
  await query('DELETE FROM sessions WHERE token_hash=$1',[req.session.token_hash]);res.clearCookie(config.cookieName,{path:'/'});res.json({message:'Sesión cerrada.'});
});
authRouter.post('/auth/forgot',accountLimit,async(req,res)=>{
  const input=parse(z.object({email}),req.body);
  const user=(await query('SELECT id,email FROM users WHERE email=$1 AND verified_at IS NOT NULL',[input.email])).rows[0];
  if(user) await tx(db=>accountEmail(db,user,'reset'));
  res.json({message:'Si existe la cuenta, recibirás un enlace de recuperación.'});
});
authRouter.post('/auth/resend',authenticated,accountLimit,async(req,res)=>{
  if(!req.user.verified_at) await tx(db=>accountEmail(db,req.user,'verify'));
  res.json({message:'Solicitud de verificación procesada.'});
});
for(const purpose of ['verify','reset']) authRouter.post(`/auth/${purpose}`,accountLimit,async(req,res)=>{
  const input=parse(z.object({token:z.string().regex(/^[a-f0-9]{64}$/),...(purpose==='reset'?{password:z.string().min(12).max(128)}:{})}),req.body);
  const encoded=purpose==='reset'?await passwordHash(input.password):null;
  await tx(async db=>{
    const found=(await db.query(`SELECT * FROM account_tokens WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[digest(input.token),purpose])).rows[0];
    requireThat(found,'Enlace inválido, usado o caducado.',400);
    await db.query('UPDATE account_tokens SET used_at=now() WHERE token_hash=$1',[digest(input.token)]);
    if(purpose==='verify') await db.query('UPDATE users SET verified_at=now() WHERE id=$1',[found.user_id]);
    else {
      await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[found.user_id,encoded]);
      await db.query('DELETE FROM sessions WHERE user_id=$1',[found.user_id]);
      res.clearCookie(config.cookieName,{path:'/'});
    }
  });res.json({message:purpose==='verify'?'Correo verificado.':'Contraseña actualizada. Inicia sesión de nuevo.'});
});
authRouter.post('/auth/password',authenticated,accountLimit,async(req,res)=>{
  const input=parse(z.object({currentPassword:z.string().max(128),password:z.string().min(12).max(128)}),req.body);
  requireThat(input.currentPassword!==input.password,'Elige una contraseña diferente.');
  const encoded=await passwordHash(input.password);
  await tx(async db=>{
    const user=(await db.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
    requireThat(await passwordMatches(input.currentPassword,user.password_hash),'Contraseña actual incorrecta.',422);
    await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[req.user.id,encoded]);
    await db.query('DELETE FROM sessions WHERE user_id=$1',[req.user.id]);
    await audit(db,req,'account.password.changed',req.user.id);
  });
  res.clearCookie(config.cookieName,{path:'/'});res.json({message:'Contraseña actualizada. Inicia sesión de nuevo en tus dispositivos.'});
});
authRouter.get('/me',async(req,res)=>{
  res.json({user:req.user||null,organizations:req.organizations?.map(({payout_encrypted,...o})=>o)||[],organizationId:req.org?.id||null,csrfToken:req.session?.csrf_token||null,sandbox:!config.production,realCheckoutEnabled:false,purchasesEnabled:config.purchasesEnabled&&!config.production,demo:demoEnabled(),mailLocal:!config.production&&!process.env.SMTP_HOST,contact:process.env.BUSINESS_CONTACT_EMAIL||null});
});
authRouter.get('/dev/mail',authenticated,async(req,res)=>{
  requireThat(!config.production&&!process.env.SMTP_HOST,'Buzón sandbox no disponible.',404);
  res.json((await query('SELECT id,subject,body,state,created_at FROM mail_outbox WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[req.user.id])).rows);
});
