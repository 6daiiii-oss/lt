import {Router} from 'express';
import {z} from 'zod';
import {query,tx} from './db.js';
import {authenticated,orgRole,verified} from './auth.js';
import {audit,id,cents,quantity,notify,parse,requireThat,sumMoney,validateQuantity,peruDay} from './lib.js';
import {accessibleOrder} from './commerce.js';
export const negotiationRouter=Router();
negotiationRouter.use(authenticated);
const administrator=req=>!!(req.user?.is_admin&&req.user?.verified_at);
const member=(req,buyer,seller)=>administrator(req)||(req.org?.status!=='suspended'&&[buyer,seller].includes(req.org?.id));
const messageId=z.string().regex(/^\d+$/).max(19).refine(v=>/^\d+$/.test(v)&&BigInt(v)<=9223372036854775807n);
const itemSchema=z.object({product_id:id,quantity});
const safeUrl=z.string().url().max(1500).refine(s=>/^https?:\/\//.test(s),'Usa un enlace http o https.');
export const shipmentSchema=z.object({state:z.enum(['preparing','shipped']),carrier:z.string().trim().min(1).max(500).optional(),tracking_code:z.string().trim().max(500).optional(),tracking_url:z.preprocess(v=>v===''?undefined:v,safeUrl.optional()),delivery_mode:z.enum(['agency','home']).optional(),delivery_details:z.string().trim().max(1000).optional(),shipped_at:z.iso.date().optional()});
export async function requestAccess(db,req,requestId,lock=false){
 const r=(await db.query(`SELECT r.*,b.name AS brand_name,b.organization_id AS seller_id,o.name AS buyer_name FROM order_requests r JOIN brands b ON b.id=r.brand_id JOIN organizations o ON o.id=r.buyer_id WHERE r.id=$1 ${lock?'FOR UPDATE OF r':''}`,[requestId])).rows[0];
 requireThat(r&&member(req,r.buyer_id,r.seller_id),'Solicitud no encontrada.',404);return r;
}
async function conversationAccess(db,req,conversationId){
 const c=(await db.query('SELECT c.*,b.name AS brand_name,b.organization_id AS seller_id,o.name AS buyer_name FROM conversations c JOIN brands b ON b.id=c.brand_id JOIN organizations o ON o.id=c.buyer_id WHERE c.id=$1',[conversationId])).rows[0];
 requireThat(c&&member(req,c.buyer_id,c.seller_id),'Conversación no encontrada.',404);return c;
}
async function event(db,req,r,name,details={}){await db.query('INSERT INTO request_events(request_id,user_id,event,details) VALUES($1,$2,$3,$4)',[r.id,req.user.id,name,details]);await audit(db,req,name,r.id,details);}
async function products(db,brandId,items,{offering=false}={}){
 requireThat(new Set(items.map(i=>i.product_id)).size===items.length,'No repitas un producto.',422);
 const rows=[];
 for(const i of [...items].sort((a,b)=>a.product_id.localeCompare(b.product_id))){
  const p=(await db.query('SELECT p.*,i.total-i.reserved AS available,o.status AS seller_status FROM products p JOIN inventory i ON i.product_id=p.id JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id WHERE p.id=$1 FOR SHARE OF p,i',[i.product_id])).rows[0];
  requireThat(p&&p.brand_id===brandId,'Cada solicitud admite productos de un único proveedor.',422,'mixed_suppliers');requireThat(p.status==='published'&&p.seller_status==='approved','Producto o proveedor no disponible.',422);
  validateQuantity(p,i.quantity);if(offering)requireThat(!i.available||p.available>=i.quantity,'No puedes confirmar más unidades de las disponibles.',422);
  rows.push({product_id:p.id,name:p.name,variant:p.variant||'',quantity:i.quantity,unit_price_cents:offering?i.unit_price_cents:p.wholesale_cents,available:offering?i.available:p.available>=i.quantity});
 }
 return rows;
}
negotiationRouter.post('/requests',verified,orgRole('buyer'),async(req,res)=>{
 const v=parse(z.object({brand_id:id,address_id:id,items:z.array(itemSchema).min(1).max(100),note:z.string().trim().max(4000).default('')}),req.body);
 const result=await tx(async db=>{
  const brand=(await db.query(`SELECT b.*,o.status FROM brands b JOIN organizations o ON o.id=b.organization_id WHERE b.id=$1`,[v.brand_id])).rows[0];requireThat(brand?.status==='approved','Proveedor no disponible.',422);
  const dest=(await db.query('SELECT recipient,line1,district,region,country,phone FROM addresses WHERE id=$1 AND organization_id=$2',[v.address_id,req.org.id])).rows[0];requireThat(dest,'Elige una dirección de tu negocio.',422);
  const items=await products(db,v.brand_id,v.items);
  const c=(await db.query('INSERT INTO conversations(brand_id,buyer_id) VALUES($1,$2) RETURNING id',[v.brand_id,req.org.id])).rows[0];
  const r=(await db.query('INSERT INTO order_requests(brand_id,buyer_id,conversation_id,address_id,destination,requested_items) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[v.brand_id,req.org.id,c.id,v.address_id,dest,JSON.stringify(items)])).rows[0];
  if(v.note)await db.query('INSERT INTO conversation_messages(conversation_id,user_id,organization_id,message) VALUES($1,$2,$3,$4)',[c.id,req.user.id,req.org.id,v.note]);
  await event(db,req,r,'request.created');await notify(db,brand.organization_id,'request','Nueva solicitud de productos.','/solicitudes/'+r.id);return r;
 });res.status(201).json(result);
});
negotiationRouter.get('/requests',async(req,res)=>{
 requireThat((req.org&&req.org.status!=='suspended')||administrator(req),'Organización habilitada requerida.',403);
 const result=await query(`SELECT r.*,b.name AS brand_name,o.name AS buyer_name FROM order_requests r JOIN brands b ON b.id=r.brand_id JOIN organizations o ON o.id=r.buyer_id WHERE ($2 OR r.buyer_id=$1 OR b.organization_id=$1) ORDER BY r.created_at DESC LIMIT 200`,[req.org?.id||null,administrator(req)]);res.json(result.rows);
});
negotiationRouter.get('/requests/:id',async(req,res)=>{
 const r=await requestAccess({query},req,id.parse(req.params.id));
 if(administrator(req))await audit({query},req,'request.admin_read',r.id);
 const [quotes,acceptances,events]=await Promise.all([query('SELECT * FROM request_quotes WHERE request_id=$1 ORDER BY version DESC',[r.id]),query('SELECT version,created_at FROM request_acceptances WHERE request_id=$1 ORDER BY version',[r.id]),query('SELECT event,details,created_at FROM request_events WHERE request_id=$1 ORDER BY id',[r.id])]);
 res.json({...r,quotes:quotes.rows,acceptances:acceptances.rows,events:events.rows,payment_available:false,payment_notice:'El pago está deshabilitado. Falta definir quién paga el transporte y si se cobra dentro de Vendo o directamente a la agencia. No se ha reservado stock ni cobrado dinero.'});
});
const offerSchema=z.object({expected_version:z.number().int().min(0),items:z.array(itemSchema.extend({unit_price_cents:cents.refine(n=>n>0),available:z.boolean()})).min(1).max(100),discount_cents:cents.default(0),shipping_cents:cents.nullable(),dispatch_date:z.iso.date(),arrival_from:z.iso.date(),arrival_to:z.iso.date(),delivery_mode:z.enum(['agency','home']),delivery_details:z.string().trim().min(3).max(1000),note:z.string().trim().max(2000).default('')});
negotiationRouter.post('/requests/:id/quotes',verified,orgRole('seller'),async(req,res)=>{
 const v=parse(offerSchema,req.body);
 const result=await tx(async db=>{
  const r=await requestAccess(db,req,id.parse(req.params.id),true);requireThat(r.seller_id===req.org.id,'Solo responde el proveedor de esta solicitud.',403);requireThat(r.state!=='cancelled'&&!r.order_id,'Solicitud cerrada.',409);requireThat(r.version===v.expected_version,'Las condiciones cambiaron. Actualiza la página.',409,'quote_conflict');
  requireThat(v.items.length===r.requested_items.length&&v.items.every(i=>r.requested_items.some(p=>p.product_id===i.product_id)),'Confirma todos los productos solicitados. Marca los no disponibles.',422);
  requireThat(v.dispatch_date>=peruDay()&&v.arrival_from>=v.dispatch_date&&v.arrival_to>=v.arrival_from,'Revisa las fechas estimadas.',422);
  const items=await products(db,r.brand_id,v.items,{offering:true}),subtotal=sumMoney(items.map(i=>i.quantity*i.unit_price_cents));requireThat(v.discount_cents<subtotal,'El descuento debe ser menor al subtotal.',422);
  const total=v.shipping_cents===null?null:sumMoney([subtotal-v.discount_cents,v.shipping_cents]);
  const q=(await db.query(`INSERT INTO request_quotes(request_id,version,author_id,items,subtotal_cents,discount_cents,shipping_cents,total_cents,dispatch_date,arrival_from,arrival_to,delivery_mode,delivery_details,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[r.id,r.version+1,req.user.id,JSON.stringify(items),subtotal,v.discount_cents,v.shipping_cents,total,v.dispatch_date,v.arrival_from,v.arrival_to,v.delivery_mode,v.delivery_details,v.note])).rows[0];
  await db.query(`UPDATE order_requests SET state='offered',version=$2 WHERE id=$1`,[r.id,q.version]);await event(db,req,r,'quote.offered',{version:q.version,previous_accepted_version:r.accepted_version});await notify(db,r.buyer_id,'quote','El proveedor actualizó las condiciones. Revisa y acepta la nueva versión.','/solicitudes/'+r.id);return q;
 });res.status(201).json(result);
});
negotiationRouter.post('/requests/:id/accept',verified,orgRole('buyer'),async(req,res)=>{
 const v=parse(z.object({version:z.number().int().positive(),agree:z.literal(true)}),req.body);
 await tx(async db=>{
  const r=await requestAccess(db,req,id.parse(req.params.id),true);requireThat(r.buyer_id===req.org.id,'Solo acepta la tienda compradora.',403);requireThat(['offered','accepted'].includes(r.state)&&r.version===v.version,'Las condiciones cambiaron. Revisa la versión actual.',409,'quote_conflict');
  const q=(await db.query('SELECT * FROM request_quotes WHERE request_id=$1 AND version=$2',[r.id,v.version])).rows[0];requireThat(q.shipping_cents!==null,'El envío sigue pendiente de cotización.',409,'shipping_pending');requireThat(String(q.dispatch_date).slice(0,10)>=peruDay(),'La fecha de despacho estimada pasó. Solicita nuevas condiciones.',409);requireThat(q.items.every(i=>i.available),'Hay productos sin disponibilidad confirmada.',409);
  const current=await products(db,r.brand_id,q.items);requireThat(current.every(i=>i.available),'La disponibilidad cambió. Solicita nuevas condiciones.',409,'stock_changed');
  const inserted=await db.query('INSERT INTO request_acceptances(request_id,version,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING version',[r.id,q.version,req.user.id]);
  await db.query(`UPDATE order_requests SET state='accepted',accepted_version=$2 WHERE id=$1`,[r.id,q.version]);
  if(inserted.rowCount){await event(db,req,r,'quote.accepted',{version:q.version});await notify(db,r.seller_id,'quote','La tienda aceptó las condiciones. El pago aún no está habilitado.','/solicitudes/'+r.id);}
 });res.json({message:'Condiciones aceptadas. No se ha realizado ningún cobro ni reservado stock.'});
});
negotiationRouter.post('/requests/:id/cancel',verified,async(req,res)=>{
 await tx(async db=>{const r=await requestAccess(db,req,id.parse(req.params.id),true);requireThat(!administrator(req)&&[r.buyer_id,r.seller_id].includes(req.org?.id)&&!r.order_id&&r.state!=='cancelled','No puedes cerrar esta solicitud.',409);await db.query(`UPDATE order_requests SET state='cancelled' WHERE id=$1`,[r.id]);await event(db,req,r,'request.cancelled');await notify(db,req.org.id===r.buyer_id?r.seller_id:r.buyer_id,'request','La solicitud fue cerrada. El historial se conserva.','/solicitudes/'+r.id);});res.json({message:'Solicitud cerrada.'});
});
negotiationRouter.post('/conversations',verified,async(req,res)=>{
 const v=parse(z.object({brand_id:id.optional(),product_id:id.optional(),order_id:id.optional()}).refine(v=>v.brand_id||v.product_id||v.order_id),req.body);
 const result=await tx(async db=>{
  let brandId=v.brand_id,buyerId=req.org?.id;
  if(v.order_id){const order=await accessibleOrder(db,req,v.order_id);requireThat(member(req,order.buyer_id,order.seller_id),'Pedido no encontrado.',404);brandId=order.brand_id;buyerId=order.buyer_id;}
  else {requireThat(req.org?.kind==='buyer'&&req.org.status!=='suspended','Usa una cuenta de tienda para contactar a la marca.',403);if(v.product_id){const p=(await db.query(`SELECT brand_id FROM products WHERE id=$1 AND status='published'`,[v.product_id])).rows[0];requireThat(p&&(!brandId||brandId===p.brand_id),'Producto no disponible.',404);brandId=p.brand_id;}}
  const brand=(await db.query('SELECT b.id,o.status FROM brands b JOIN organizations o ON o.id=b.organization_id WHERE b.id=$1',[brandId])).rows[0];requireThat(brand&&(v.order_id||brand.status==='approved'),'Marca no disponible.',404);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[buyerId+':'+brandId+':'+(v.order_id||v.product_id||'store')]);
  const old=(await db.query('SELECT c.* FROM conversations c WHERE c.buyer_id=$1 AND c.brand_id=$2 AND c.order_id IS NOT DISTINCT FROM $3::uuid AND c.product_id IS NOT DISTINCT FROM $4::uuid AND ($5::boolean OR NOT EXISTS(SELECT 1 FROM order_requests r WHERE r.conversation_id=c.id)) LIMIT 1',[buyerId,brandId,v.order_id||null,v.product_id||null,!!v.order_id])).rows[0];
  return old||(await db.query('INSERT INTO conversations(brand_id,buyer_id,product_id,order_id) VALUES($1,$2,$3,$4) RETURNING *',[brandId,buyerId,v.product_id||null,v.order_id||null])).rows[0];
 });res.status(201).json(result);
});
negotiationRouter.get('/conversations',async(req,res)=>{
 requireThat(req.org||administrator(req),'Organización requerida.',403);
 res.json((await query(`SELECT c.*,b.name AS brand_name,o.name AS buyer_name,r.id AS request_id,
 (SELECT count(*)::int FROM conversation_messages m WHERE m.conversation_id=c.id AND m.user_id<>$3 AND m.id>coalesce((SELECT last_message_id FROM conversation_reads cr WHERE cr.conversation_id=c.id AND cr.user_id=$3),0)) AS unread,
 (SELECT max(created_at) FROM conversation_messages m WHERE m.conversation_id=c.id) AS last_message_at
 FROM conversations c JOIN brands b ON b.id=c.brand_id JOIN organizations o ON o.id=c.buyer_id LEFT JOIN order_requests r ON r.conversation_id=c.id WHERE ($2 OR c.buyer_id=$1 OR b.organization_id=$1) ORDER BY coalesce((SELECT max(created_at) FROM conversation_messages m WHERE m.conversation_id=c.id),c.created_at) DESC LIMIT 200`,[req.org?.id||null,administrator(req),req.user.id])).rows);
});
negotiationRouter.get('/conversations/:id',async(req,res)=>{
 const c=await conversationAccess({query},req,id.parse(req.params.id));const before=req.query.before===undefined?null:messageId.parse(req.query.before);
 const messages=(await query(`SELECT m.id::text,m.user_id,m.organization_id,m.message,m.created_at,u.name FROM conversation_messages m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=$1 AND ($2::bigint IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT 100`,[c.id,before])).rows.reverse();
 const r=(await query('SELECT id FROM order_requests WHERE conversation_id=$1',[c.id])).rows[0];if(administrator(req))await audit({query},req,'conversation.admin_read',c.id);
 res.json({...c,request_id:r?.id||null,messages,older_cursor:messages.length===100?messages[0].id:null});
});
negotiationRouter.post('/conversations/:id/messages',verified,async(req,res)=>{
 const {message}=parse(z.object({message:z.string().trim().min(1).max(4000)}),req.body);
 await tx(async db=>{const c=await conversationAccess(db,req,id.parse(req.params.id));await db.query('INSERT INTO conversation_messages(conversation_id,user_id,organization_id,message) VALUES($1,$2,$3,$4)',[c.id,req.user.id,req.org?.id||null,message]);for(const target of [c.buyer_id,c.seller_id].filter(id=>id!==req.org?.id))await notify(db,target,'message','Nuevo mensaje en Vendo.','/mensajes/'+c.id);await audit(db,req,'conversation.message',c.id);});res.status(201).json({message:'Mensaje enviado.'});
});
negotiationRouter.post('/conversations/:id/read',async(req,res)=>{
 const {last_message_id}=parse(z.object({last_message_id:messageId}),req.body);const c=await conversationAccess({query},req,id.parse(req.params.id));requireThat(last_message_id==='0'||(await query('SELECT 1 FROM conversation_messages WHERE conversation_id=$1 AND id=$2',[c.id,last_message_id])).rowCount,'Referencia de mensaje inválida.',422);
 await query('INSERT INTO conversation_reads(conversation_id,user_id,last_message_id) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_message_id=greatest(conversation_reads.last_message_id,$3)',[c.id,req.user.id,last_message_id]);res.json({message:'Mensajes leídos.'});
});
