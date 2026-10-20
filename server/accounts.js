import { phoneVerified } from './phone.js';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from './db.js';
import { authenticated, orgRole, verified } from './auth.js';
import { audit, cents, decrypt, digest, email, encrypt, id, parse, requireThat, text, token } from './lib.js';
export const accountRouter=Router();
accountRouter.use(authenticated);
accountRouter.get('/account/summary',async(req,res)=>{
  requireThat(req.org,'Organización requerida.',403);
  res.json((await query(`SELECT count(*)::int AS orders,count(*) FILTER(WHERE state IN ('confirmed','preparing','shipped'))::int AS in_progress,count(*) FILTER(WHERE state='delivered')::int AS delivered FROM orders WHERE buyer_id=$1`,[req.org.id])).rows[0]);
});
accountRouter.get('/organizations/me',async(req,res)=>{
  requireThat(req.org,'Organización requerida.',403);
  const {payout_encrypted,...org}=req.org;
  res.json({...org,has_payout_details:!!payout_encrypted,brand:req.org.brand_id?(await query('SELECT * FROM brands WHERE id=$1',[req.org.brand_id])).rows[0]:null,
    documents:(await query('SELECT id,mime,size FROM attachments WHERE organization_id=$1 AND NOT public AND incident_id IS NULL',[req.org.id])).rows,
    addresses:(await query('SELECT * FROM addresses WHERE organization_id=$1 ORDER BY created_at',[req.org.id])).rows,
    verifications:(await query('SELECT id,status,notes,reason,created_at,reviewed_at FROM business_verifications WHERE organization_id=$1 ORDER BY created_at DESC',[req.org.id])).rows});
});
accountRouter.put('/organizations/me',async(req,res)=>{
  requireThat(req.org?.role==='owner','Requiere titular de organización.',403);
  const input=parse(z.object({name:text,legal_name:text,tax_id:z.string().trim().max(30),business_type:text,contact_email:email,phone:text,origin_address:z.string().max(1000),payout_details:z.object({holder:text,bank:text,account_reference:text}).optional()}),req.body);
  await tx(async db=>{
    await db.query(`UPDATE organizations SET name=$2,legal_name=$3,tax_id=$4,business_type=$5,contact_email=$6,phone=$7,origin_address=$8,payout_encrypted=coalesce($9,payout_encrypted) WHERE id=$1`,[req.org.id,input.name,input.legal_name,input.tax_id,input.business_type,input.contact_email,input.phone,input.origin_address,input.payout_details?encrypt(input.payout_details):null]);
    await audit(db,req,'organization.update',req.org.id);
  });res.json({message:'Perfil actualizado.'});
});
accountRouter.post('/organizations/me/verification',verified,phoneVerified,async(req,res)=>{
  requireThat(req.org?.role==='owner','Requiere titular.',403);
  requireThat(req.org.legal_name&&req.org.business_type&&req.org.phone,'Completa el perfil comercial antes de solicitar revisión.');
  requireThat(req.org.status!=='suspended','Organización suspendida.',403);
  const {notes}=parse(z.object({notes:z.string().max(2000).default('')}),req.body);
  const result=await query('INSERT INTO business_verifications(organization_id,notes) VALUES($1,$2) RETURNING id',[req.org.id,notes]);
  res.status(201).json(result.rows[0]);
});
export const addressSchema=z.object({recipient:text,line1:text,district:text,region:text,phone:text,country:z.literal('PE').default('PE')});
accountRouter.post('/organizations/me/addresses',verified,async(req,res)=>{
  requireThat(req.org,'Organización requerida.',403);
  const v=parse(addressSchema,req.body);
  res.status(201).json((await query(`INSERT INTO addresses(organization_id,recipient,line1,district,region,phone,country) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[req.org.id,v.recipient,v.line1,v.district,v.region,v.phone,v.country])).rows[0]);
});
accountRouter.delete('/organizations/me/addresses/:id',async(req,res)=>{
  await query('DELETE FROM addresses WHERE id=$1 AND organization_id=$2',[id.parse(req.params.id),req.org?.id]);res.json({message:'Dirección eliminada.'});
});
accountRouter.get('/favorites',orgRole('buyer'),async(req,res)=>{
  res.json((await query(`SELECT f.id,f.product_id,f.brand_id,p.name AS product_name,b.name AS brand_name FROM favorites f LEFT JOIN products p ON p.id=f.product_id LEFT JOIN brands b ON b.id=coalesce(f.brand_id,p.brand_id) WHERE organization_id=$1 ORDER BY f.created_at DESC`,[req.org.id])).rows);
});
accountRouter.post('/favorites',orgRole('buyer'),async(req,res)=>{
  const input=parse(z.object({product_id:id.optional(),brand_id:id.optional()}).refine(v=>Boolean(v.product_id)!==Boolean(v.brand_id)),req.body);
  await query('INSERT INTO favorites(organization_id,product_id,brand_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[req.org.id,input.product_id||null,input.brand_id||null]);res.status(201).json({message:'Guardado en favoritos.'});
});
accountRouter.delete('/favorites/:id',orgRole('buyer'),async(req,res)=>{
  await query('DELETE FROM favorites WHERE id=$1 AND organization_id=$2',[id.parse(req.params.id),req.org.id]);res.json({message:'Favorito eliminado.'});
});
accountRouter.get('/notifications',async(req,res)=>res.json((await query(`SELECT * FROM notifications WHERE user_id=$1 OR organization_id IN(SELECT organization_id FROM memberships WHERE user_id=$1) ORDER BY created_at DESC LIMIT 100`,[req.user.id])).rows));
accountRouter.post('/notifications/:id/read',async(req,res)=>{
  await query(`UPDATE notifications SET read_at=now() WHERE id=$1 AND (user_id=$2 OR organization_id IN(SELECT organization_id FROM memberships WHERE user_id=$2))`,[id.parse(req.params.id),req.user.id]);res.json({message:'Notificación leída.'});
});
accountRouter.post('/seller/api-keys',verified,orgRole('seller',{approved:true,owner:true}),async(req,res)=>{
  const {label}=parse(z.object({label:text}),req.body),raw=token();
  const row=(await query(`INSERT INTO api_keys(organization_id,user_id,token_hash,label,expires_at) VALUES($1,$2,$3,$4,now()+interval '90 days') RETURNING id,label,expires_at`,[req.org.id,req.user.id,digest(raw),label])).rows[0];
  res.status(201).json({...row,token:raw,message:'Copia la clave ahora; no volverá a mostrarse. Solo permite /api/seller/catalog/upsert.'});
});
accountRouter.get('/seller/api-keys',orgRole('seller',{owner:true}),async(req,res)=>res.json((await query('SELECT id,label,expires_at,revoked_at FROM api_keys WHERE organization_id=$1',[req.org.id])).rows));
accountRouter.delete('/seller/api-keys/:id',orgRole('seller',{owner:true}),async(req,res)=>{
  await query('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND organization_id=$2',[id.parse(req.params.id),req.org.id]);res.json({message:'Clave revocada.'});
});
