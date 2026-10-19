import { Router } from 'express';
import sharp from 'sharp';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from './db.js';
import { config } from './config.js';
import { authenticated, verified } from './auth.js';
import { accessibleOrder } from './commerce.js';
import { audit, id, parse, requireThat } from './lib.js';
export const mediaRouter=Router();
mediaRouter.post('/uploads',authenticated,verified,async(req,res)=>{
  requireThat(req.org&&req.org.status!=='suspended','Organización no habilitada.',403);
  const input=parse(z.object({purpose:z.enum(['product','incident','verification']),incident_id:id.optional()}),req.query);
  requireThat(input.purpose==='incident'||!input.incident_id,'Una imagen de catálogo o verificación no puede asociarse a una incidencia.');
  requireThat(Buffer.isBuffer(req.body)&&req.body.length>0&&req.body.length<=config.uploadMaxBytes,'Envía una imagen JPEG, PNG o WebP dentro del límite.',413);
  if(input.purpose==='product') requireThat(req.org.kind==='seller','Solo proveedores suben imágenes de catálogo.',403);
  if(input.purpose==='incident') {
    requireThat(input.incident_id,'Selecciona incidencia.');const i=(await query('SELECT order_id FROM incidents WHERE id=$1',[input.incident_id])).rows[0];requireThat(i,'Incidencia no encontrada.',404);await accessibleOrder({query},req,i.order_id);
  }
  let data;
  try {data=await sharp(req.body,{limitInputPixels:20_000_000,animated:false}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}
  catch{requireThat(false,'La imagen no es válida o supera el límite de píxeles.',422);}
  const key=`${randomUUID()}.webp`;
  await mkdir(config.storage,{recursive:true});await writeFile(join(config.storage,key),data,{flag:'wx',mode:0o600});
  try {
    const row=(await query('INSERT INTO attachments(organization_id,incident_id,file_key,mime,size,public) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,public',[req.org.id,input.incident_id||null,key,'image/webp',data.length,input.purpose==='product'])).rows[0];
    await audit({query},req,'attachment.uploaded',row.id,{purpose:input.purpose});res.status(201).json({id:row.id,url:row.public?`/media/${row.id}`:`/api/attachments/${row.id}`});
  }catch(error){await unlink(join(config.storage,key));throw error;}
});
mediaRouter.get('/attachments/:id',authenticated,async(req,res)=>{
  const row=(await query('SELECT * FROM attachments WHERE id=$1',[id.parse(req.params.id)])).rows[0];requireThat(row,'Documento no encontrado.',404);
  if(row.incident_id) {const i=(await query('SELECT order_id FROM incidents WHERE id=$1',[row.incident_id])).rows[0];await accessibleOrder({query},req,i.order_id);}
  else requireThat(req.user.is_admin||row.organization_id===req.org?.id,'Documento no encontrado.',404);
  await audit({query},req,'attachment.viewed',row.id);res.type(row.mime).set('Cache-Control','private, no-store').sendFile(join(config.storage,row.file_key),{dotfiles:'allow'});
});
export async function servePublicImage(req,res) {
  const row=(await query('SELECT * FROM attachments WHERE id=$1 AND public',[id.parse(req.params.id)])).rows[0];requireThat(row,'Imagen no encontrada.',404);res.type(row.mime).sendFile(join(config.storage,row.file_key),{dotfiles:'allow'});
}
