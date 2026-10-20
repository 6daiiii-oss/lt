import { randomBytes, createHash, createHmac, timingSafeEqual, scrypt as scryptCb, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { config } from './config.js';
z.config(z.locales.es());
const scrypt = promisify(scryptCb);
export const id = z.uuid();
export const text = z.string().trim().min(1).max(500);
export const email = z.email().max(254).transform(v => v.toLowerCase());
export const cents = z.number().int().min(0).max(100_000_000);
export const quantity = z.number().int().min(1).max(1_000_000);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHmac('sha256', config.sessionSecret).update(value).digest('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export function equal(a, b) { const x=Buffer.from(a||''), y=Buffer.from(b||''); return x.length===y.length && timingSafeEqual(x,y); }
export async function passwordHash(password) {
  const salt=randomBytes(16).toString('hex');
  const result=await scrypt(password,salt,64,{N:65536,r:8,p:1,maxmem:128*1024*1024});
  return `scrypt$65536$8$1$${salt}$${result.toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  const [,n,r,p,salt,result]=stored.split('$');
  const derived=await scrypt(password,salt,64,{N:Number(n),r:Number(r),p:Number(p),maxmem:128*1024*1024});
  return equal(derived.toString('hex'),result);
}
export function encrypt(value) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(config.encryptionKey,'hex'),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
}
export function decrypt(value) {
  if (!value) return null;
  const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64'));
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(config.encryptionKey,'hex'),iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString());
}
export class HttpError extends Error { constructor(status,message,code='invalid_request',details) { super(message); Object.assign(this,{status,code,details}); } }
export function requireThat(ok,message,status=400,code='invalid_request',details) { if (!ok) throw new HttpError(status,message,code,details); }
export const parse = (schema, data) => schema.parse(data);
export async function audit(db, req, action, resource, details={}) {
  await db.query('INSERT INTO audit_logs(actor_id,organization_id,action,resource_id,details) VALUES($1,$2,$3,$4,$5)',[req.user?.id||null,req.org?.id||null,action,String(resource),details]);
}
export async function notify(db, organizationId, kind, title, link) {
  await db.query('INSERT INTO notifications(organization_id,kind,title,link) VALUES($1,$2,$3,$4)',[organizationId,kind,title,link]);
  await db.query(`INSERT INTO mail_outbox(user_id,subject,body) SELECT user_id,$2,$3 FROM memberships WHERE organization_id=$1`,[organizationId,title,`${title}\n${config.origin}${link}`]);
}
export function margin(wholesale, retail, sameTaxBasis=false) { return retail>0&&sameTaxBasis ? ((retail-wholesale)*100)/retail : null; }
export function validateQuantity(product, n) {
  requireThat(Number.isSafeInteger(n)&&n>=product.moq&&n%product.pack_multiple===0,`Debes comprar al menos ${product.moq} unidades, en grupos de ${product.pack_multiple}.`,422,'quantity');
  requireThat(Number.isSafeInteger(product.wholesale_cents)&&product.wholesale_cents>0,'Precio mayorista inválido.',422);
}
export function sumMoney(values) { const sum=values.reduce((a,b)=>a+b,0); requireThat(Number.isSafeInteger(sum)&&sum>=0&&sum<=2_000_000_000,'Importe fuera de límite.'); return sum; }
export const commission = (subtotal,bps) => Math.floor((subtotal*bps+5000)/10000);
export function peruDay(date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export const asyncNoop = () => {};
