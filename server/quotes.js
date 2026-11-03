import {Router} from 'express';import {z} from 'zod';
import {query,tx} from './db.js';import {authenticated,orgRole} from './auth.js';
import {audit,cents,id,notify,parse,quantity,requireThat} from './lib.js';
import {priceProduct} from '../public/modules/volume-pricing.js';import {presentationContract,resolveLine} from './line-pricing.js';import {stockAvailable} from './stock.js';
import {ensureCart,lockBuyer,pendingCheckout} from './commerce.js';import {config} from './config.js';import {feeBreakdown} from './pricing.js';
export const quotesRouter=Router();quotesRouter.use(authenticated);
const lineSchema=z.object({product_id:id,presentation_key:z.string().max(60).default(''),pack_quantity:quantity,assortment_note:z.string().trim().max(500).default('')});
const productSql=`SELECT p.*,i.total,i.reserved,i.pack_stock,i.source_updated_at,b.organization_id AS seller_id,o.status AS seller_status,b.terms_approved FROM products p JOIN inventory i ON i.product_id=p.id JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id WHERE p.id=$1`;
function linePrice(p,item){try{return priceProduct(p,item);}catch(e){requireThat(false,e.message,422,'presentation_conditions');}}
async function access(db,req,quoteId,lock=false){const q=(await db.query(`SELECT q.*,b.name AS brand_name,b.organization_id AS seller_id,o.name AS buyer_name FROM special_quotes q JOIN brands b ON b.id=q.brand_id JOIN organizations o ON o.id=q.buyer_id WHERE q.id=$1 ${lock?'FOR UPDATE OF q':''}`,[quoteId])).rows[0];requireThat(q&&(req.user.is_admin||req.org?.id===q.buyer_id||req.org?.id===q.seller_id),'Cotización no encontrada.',404);return q;}
function view(q,req){const expired=!!q.expires_at&&new Date(q.expires_at)<=new Date();return {...q,expired,...(q.offer&&req.org?.id===q.seller_id?{fees:feeBreakdown(q.offer.subtotal_cents,q.offer.shipping_cents)}:{})};}
quotesRouter.get('/quotes',async(req,res)=>{requireThat(req.org,'Selecciona tu negocio.',403);const rows=(await query(`SELECT q.*,b.name AS brand_name,b.organization_id AS seller_id,o.name AS buyer_name FROM special_quotes q JOIN brands b ON b.id=q.brand_id JOIN organizations o ON o.id=q.buyer_id WHERE q.buyer_id=$1 OR b.organization_id=$1 ORDER BY q.updated_at DESC LIMIT 200`,[req.org.id])).rows;res.json(rows.map(q=>view(q,req)));});
quotesRouter.get('/quotes/:id',async(req,res)=>res.json(view(await access({query},req,id.parse(req.params.id)),req)));
quotesRouter.post('/quotes',orgRole('buyer'),async(req,res)=>{
 const input=parse(z.object({brand_id:id,items:z.array(lineSchema).min(1).max(30),reason:z.enum(['volume','mixed','custom','shipping']),destination:z.object({region:z.string().trim().min(1).max(100),district:z.string().trim().min(1).max(100),address:z.string().trim().max(500).default('')}),note:z.string().trim().max(3000).default('')}),req.body);
 requireThat(new Set(input.items.map(x=>x.product_id)).size===input.items.length,'Usa una sola presentación por producto en la solicitud.',422);
 const q=await tx(async db=>{
  requireThat((await db.query("SELECT count(*)::int AS n FROM special_quotes WHERE buyer_id=$1 AND created_at>now()-interval '1 hour'",[req.org.id])).rows[0].n<20,'Espera antes de enviar más solicitudes.',429);
  const items=[];let seller;
  for(const item of input.items){const p=(await db.query(productSql,[item.product_id])).rows[0];requireThat(p&&p.brand_id===input.brand_id&&p.quote_enabled&&p.status==='published'&&p.seller_status==='approved'&&p.terms_approved,'El producto no admite cotizaciones o no está publicado.',422);const pricing=linePrice(p,item);if(input.reason==='volume'&&pricing.presentation?.quote_from)requireThat(item.pack_quantity>=pricing.presentation.quote_from,`Las cotizaciones por volumen empiezan desde ${pricing.presentation.quote_from} ${pricing.presentation_name}.`,422);requireThat(!item.assortment_note||pricing.presentation?.allow_assortment,'Esta presentación no admite surtido.',422);items.push({...item,name:p.name,sku:p.sku,variant:p.variant,units:pricing.units,presentation_name:pricing.presentation_name,units_per_pack:pricing.units_per_pack});seller=p.seller_id;}
  const q=(await db.query('INSERT INTO special_quotes(buyer_id,brand_id,created_by,request_items,destination,buyer_note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.org.id,input.brand_id,req.user.id,JSON.stringify(items),input.destination,({volume:'Volumen especial',mixed:'Pedido con varios productos',custom:'Personalización o encargo',shipping:'Transporte'}[input.reason])+': '+input.note])).rows[0];
  await audit(db,req,'quote.requested',q.id);await notify(db,seller,'quote','Nueva solicitud de cotización.','/panel/cotizaciones/'+q.id);return q;
 });res.status(201).json(q);
});
quotesRouter.put('/quotes/:id/offer',orgRole('seller',{approved:true}),async(req,res)=>{
 const input=parse(z.object({version:z.number().int().nonnegative(),items:z.array(lineSchema.extend({price_cents:cents.refine(n=>n>0)})).min(1).max(30),shipping_cents:cents,delivery_date:z.iso.date(),expires_at:z.iso.datetime(),note:z.string().trim().max(3000).default('')}),req.body);
 const expires=new Date(input.expires_at);requireThat(expires>new Date()&&expires.getTime()<=Date.now()+30*86400000,'El vencimiento debe estar entre ahora y los próximos 30 días.',422);requireThat(input.delivery_date>=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),'La entrega no puede estar en el pasado.',422);
 const q=await tx(async db=>{
  const q=await access(db,req,id.parse(req.params.id),true);requireThat(q.seller_id===req.org.id,'Acceso no autorizado.',403);requireThat(['requested','offered'].includes(q.status)&&q.version===input.version,'La solicitud cambió o ya fue aceptada. Recarga la página.',409);
  requireThat(input.items.length===q.request_items.length&&new Set(input.items.map(x=>x.product_id)).size===input.items.length,'La oferta debe incluir todos los productos solicitados.',422);
  const items=[];let subtotal=0;
  for(const item of input.items){const requested=q.request_items.find(x=>x.product_id===item.product_id);requireThat(requested&&requested.presentation_key===item.presentation_key,'La presentación debe coincidir con la solicitud.',422);const p=(await db.query(productSql+' FOR UPDATE OF p,i',[item.product_id])).rows[0];requireThat(p&&p.brand_id===q.brand_id&&p.status==='published'&&p.seller_status==='approved'&&p.terms_approved,'Producto no disponible.',409);const pricing=linePrice(p,item);requireThat(!item.assortment_note||pricing.presentation?.allow_assortment,'Esta presentación no admite surtido.',422);const total=item.pack_quantity*item.price_cents;requireThat(Number.isSafeInteger(total)&&total<=100_000_000,'Importe fuera de límite.',422);subtotal+=total;items.push({...item,name:p.name,variant:p.variant,presentation_name:pricing.presentation_name,units_per_pack:pricing.units_per_pack,units:pricing.units,inventory_key:pricing.inventory_key,pack_price_cents:item.price_cents,line_total_cents:total,contract:presentationContract(p,pricing)});}
  requireThat(subtotal+input.shipping_cents<=100_000_000,'Total fuera de límite.',422);
  const offer={items,subtotal_cents:subtotal,shipping_cents:input.shipping_cents,total_cents:subtotal+input.shipping_cents,delivery_date:input.delivery_date,commission_bps:500};
  const updated=(await db.query("UPDATE special_quotes SET status='offered',version=version+1,offer=$2,expires_at=$3,seller_note=$4,updated_at=now() WHERE id=$1 RETURNING *",[q.id,offer,expires,input.note])).rows[0];await audit(db,req,'quote.offered',q.id,{version:updated.version});await notify(db,q.buyer_id,'quote','Tu proveedor respondió con una cotización.','/cotizaciones/'+q.id);return updated;
 });res.json(q);
});
quotesRouter.post('/quotes/:id/accept',orgRole('buyer'),async(req,res)=>{
 const input=parse(z.object({version:z.number().int().positive()}),req.body);
 const q=await tx(async db=>{
  await lockBuyer(db,req.org.id);const q=await access(db,req,id.parse(req.params.id),true);requireThat(q.buyer_id===req.org.id,'Acceso no autorizado.',403);requireThat(q.version===input.version&&['offered','accepted'].includes(q.status)&&new Date(q.expires_at)>new Date(),'La oferta cambió o venció. Solicita una nueva.',409);
  requireThat(q.offer.delivery_date>=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),'La fecha de entrega acordada pasó. Solicita actualizarla.',409);
  for(const item of q.offer.items){const p=(await db.query(productSql+' FOR UPDATE OF p,i',[item.product_id])).rows[0];requireThat(p&&p.status==='published'&&p.seller_status==='approved'&&p.terms_approved,'Un producto dejó de estar disponible.',409);const pricing=linePrice(p,item);requireThat(presentationContract(p,pricing)===item.contract,'Cambió una presentación. Solicita actualizar la oferta.',409);requireThat(stockAvailable(p,pricing.inventory_key)>=pricing.units,'No hay stock suficiente. Solicita actualizar la oferta.',409);}
  const updated=(await db.query("UPDATE special_quotes SET status='accepted',accepted_at=coalesce(accepted_at,now()),updated_at=now() WHERE id=$1 RETURNING *",[q.id])).rows[0];await audit(db,req,'quote.accepted',q.id,{version:q.version});if(q.status!=='accepted')await notify(db,q.seller_id,'quote','La tienda aceptó tu cotización.','/panel/cotizaciones/'+q.id);return updated;
 });res.json({...q,message:'Cotización aceptada. La aceptación no reserva stock ni realiza cobros.'});
});
quotesRouter.post('/quotes/:id/cart',orgRole('buyer'),async(req,res)=>{
 requireThat(config.purchasesEnabled&&!config.production,'La cotización está guardada. Las compras todavía no están habilitadas.',409,'purchases_unavailable');
 await tx(async db=>{
  await lockBuyer(db,req.org.id);requireThat(!await pendingCheckout(db,req.org.id),'Cancela o finaliza el checkout pendiente.',409);
  const q=await access(db,req,id.parse(req.params.id),true);requireThat(q.buyer_id===req.org.id,'Acceso no autorizado.',403);
  const cartId=await ensureCart(db,req.org.id);await db.query('DELETE FROM cart_items WHERE cart_id=$1',[cartId]);
  for(const item of q.offer?.items||[]){const p=(await db.query(productSql+' FOR UPDATE OF p,i',[item.product_id])).rows[0];requireThat(p&&p.status==='published'&&p.seller_status==='approved'&&p.terms_approved,'Producto no disponible.',409);const pricing=await resolveLine(db,p,{...item,offer_id:q.id},req.org.id);requireThat(stockAvailable(p,pricing.inventory_key)>=pricing.units,'Stock insuficiente.',409);await db.query('INSERT INTO cart_items(cart_id,product_id,quantity,quoted_price_cents,presentation_key,pack_quantity,assortment_note,offer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[cartId,p.id,pricing.units,pricing.pack_price_cents,pricing.presentation_key,pricing.pack_quantity,item.assortment_note,q.id]);}
  requireThat(q.offer?.items.length,'Oferta no disponible.',409);
 });res.json({message:'Cotización completa añadida a la bolsa.'});
});
quotesRouter.post('/quotes/:id/decline',orgRole('buyer'),async(req,res)=>{await tx(async db=>{const q=await access(db,req,id.parse(req.params.id),true);requireThat(q.buyer_id===req.org.id&&['requested','offered'].includes(q.status),'No puedes rechazar esta cotización.',409);await db.query("UPDATE special_quotes SET status='declined',updated_at=now() WHERE id=$1",[q.id]);});res.json({message:'Cotización rechazada.'});});
