import { normalizeRegion, peruRegions } from '../public/modules/regions.js';
import { phoneVerified } from './phone.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { query, tx } from './db.js';
import { config } from './config.js';
import { authenticated, orgRole, verified } from './auth.js';
import { audit, cents, id, notify, parse, peruDay, requireThat, text } from './lib.js';
import { applyImport, csvColumns, csvRows, productSchema, stageImport, upsertProduct } from './imports.js';
import { accessibleOrder } from './commerce.js';
export const sellerRouter=Router();
sellerRouter.use(authenticated,orgRole('seller'));
sellerRouter.use((req,res,next)=>['GET','HEAD'].includes(req.method)?next():phoneVerified(req,res,next));
sellerRouter.get('/summary',async(req,res)=>{
  const orders=(await query(`SELECT count(*) FILTER(WHERE state IN ('confirmed','preparing'))::int AS pending_orders,count(*)::int AS orders FROM orders WHERE brand_id=$1`,[req.org.brand_id])).rows[0];
  const products=(await query(`SELECT count(*)::int AS products,count(*) FILTER(WHERE total-reserved<moq*2)::int AS low_stock FROM products p JOIN inventory i ON i.product_id=p.id WHERE brand_id=$1`,[req.org.brand_id])).rows[0];
  const jobs=(await query(`SELECT count(*)::int AS failed_syncs FROM catalog_sources WHERE brand_id=$1 AND last_error IS NOT NULL`,[req.org.brand_id])).rows[0];
  const latest_orders=(await query(`SELECT o.id,o.total_cents,o.state,o.created_at,buyer.name AS buyer_name FROM orders o JOIN organizations buyer ON buyer.id=o.buyer_id WHERE o.brand_id=$1 ORDER BY o.created_at DESC LIMIT 5`,[req.org.brand_id])).rows;
  res.json({...orders,...products,...jobs,latest_orders});
});
sellerRouter.put('/brand',verified,orgRole('seller',{owner:true}),async(req,res)=>{
  const v=parse(z.object({name:text,story:z.string().max(3000),location:text,min_order_cents:cents,shipping_cents:cents,
    shipping_regions:z.array(z.string().transform(normalizeRegion).refine(value=>peruRegions.some(name=>normalizeRegion(name)===value),'Selecciona una región válida de Perú.')).min(1,'Selecciona al menos una región de envío.').max(30),preparation_days:z.number().int().min(0).max(365),shipping_policy:text,return_policy:text,terms_approved:z.boolean()}),req.body);
  await tx(async db=>{
    await db.query(`UPDATE brands SET name=$2,story=$3,location=$4,min_order_cents=$5,shipping_cents=$6,shipping_regions=$7,preparation_days=$8,shipping_policy=$9,return_policy=$10,terms_approved=$11 WHERE id=$1`,[req.org.brand_id,v.name,v.story,v.location,v.min_order_cents,v.shipping_cents,v.shipping_regions,v.preparation_days,v.shipping_policy,v.return_policy,v.terms_approved]);
    await audit(db,req,'brand.terms.updated',req.org.brand_id);
  });res.json({message:'Condiciones actualizadas. Los checkouts pendientes volverán a validar precio y condiciones.'});
});
sellerRouter.get('/products',async(req,res)=>res.json((await query(`SELECT p.*,p.wholesale_cents AS customer_price_cents,p.supplier_cents AS wholesale_cents,i.total,i.reserved,i.total-i.reserved AS available,i.source_updated_at,(SELECT json_agg(json_build_object('url',url,'alt',alt) ORDER BY position) FROM product_images WHERE product_id=p.id) AS images FROM products p JOIN inventory i ON i.product_id=p.id WHERE brand_id=$1 ORDER BY p.created_at DESC LIMIT 1000`,[req.org.brand_id])).rows));
sellerRouter.post('/products',verified,async(req,res)=>{
  const input=parse(productSchema,req.body);
  const result=await tx(async db=>{const product=await upsertProduct(db,req.org.brand_id,input);await audit(db,req,'product.upsert',product.id);return product;});res.status(201).json(result);
});
sellerRouter.put('/products/:id',verified,async(req,res)=>{
  const existing=(await query('SELECT id,sku FROM products WHERE id=$1 AND brand_id=$2',[id.parse(req.params.id),req.org.brand_id])).rows[0];
  requireThat(existing,'Producto no encontrado.',404);const input=parse(productSchema,req.body);requireThat(input.sku===existing.sku,'El código del producto no se puede cambiar. Crea otra presentación y archiva la anterior.');
  const result=await tx(async db=>{const p=await upsertProduct(db,req.org.brand_id,input);await audit(db,req,'product.updated',p.id);return p;});res.json(result);
});
sellerRouter.post('/products/:id/archive',verified,async(req,res)=>{
  const result=await query(`UPDATE products SET status='archived',updated_at=now() WHERE id=$1 AND brand_id=$2 RETURNING id`,[id.parse(req.params.id),req.org.brand_id]);requireThat(result.rowCount,'Producto no encontrado.',404);await audit({query},req,'product.archived',req.params.id);res.json({message:'Producto archivado; se conserva su historial.'});
});
const importLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
sellerRouter.get('/imports/template.csv',async(req,res)=>res.type('text/csv').attachment('lote-productos.csv').send(csvColumns.join(',')+'\r\n'));
sellerRouter.get('/imports',async(req,res)=>res.json((await query('SELECT * FROM import_jobs WHERE brand_id=$1 ORDER BY created_at DESC LIMIT 100',[req.org.brand_id])).rows));
sellerRouter.post('/imports',verified,importLimit,async(req,res)=>{
  requireThat(typeof req.body==='string','Envía text/csv con UTF-8.',415);
  const rows=csvRows(req.body);
  const job=await tx(db=>stageImport(db,req,rows));res.status(201).json(job);
});
sellerRouter.get('/imports/:id',async(req,res)=>{
  const job=(await query('SELECT * FROM import_jobs WHERE id=$1 AND brand_id=$2',[id.parse(req.params.id),req.org.brand_id])).rows[0];requireThat(job,'Lote no encontrado.',404);
  res.json({...job,rows:(await query('SELECT row_number,data,errors FROM import_rows WHERE job_id=$1 ORDER BY row_number',[job.id])).rows});
});
sellerRouter.post('/imports/:id/publish',verified,orgRole('seller',{approved:true}),async(req,res)=>{
  parse(z.object({confirm:z.literal(true)}),req.body);
  res.json(await tx(db=>applyImport(db,req,id.parse(req.params.id))));
});
sellerRouter.post('/catalog/upsert',verified,orgRole('seller',{approved:true}),importLimit,async(req,res)=>{
  const input=parse(z.object({products:z.array(z.unknown()).min(1).max(config.importMaxRows),dry_run:z.boolean().default(true),confirm:z.boolean().default(false)}),req.body);
  requireThat(input.dry_run||input.confirm,'Confirma expresamente la aplicación del lote.');
  const key=z.string().min(8).max(128).parse(req.headers['idempotency-key']);
  const result=await tx(async db=>{
    await db.query('SELECT id FROM brands WHERE id=$1 FOR UPDATE',[req.org.brand_id]);
    const job=await stageImport(db,req,input.products,{key});
    if(!input.dry_run&&job.state!=='invalid') return {job,...await applyImport(db,req,job.id)};
    return {job,applied:false};
  });res.status(result.job?.state==='invalid'?422:200).json(result);
});
sellerRouter.get('/sources',async(req,res)=>res.json((await query(`SELECT s.*,(SELECT json_agg(r) FROM(SELECT id,state,message,row_count,started_at,finished_at FROM sync_runs WHERE source_id=s.id ORDER BY started_at DESC LIMIT 10) r) AS runs FROM catalog_sources s WHERE brand_id=$1 ORDER BY created_at DESC`,[req.org.brand_id])).rows));
sellerRouter.post('/sources',verified,orgRole('seller',{approved:true,owner:true}),async(req,res)=>{
  const input=parse(z.object({url:z.url().max(2000),credential_env:z.string().regex(/^LOTE_FEED_[A-Z0-9_]+$/).nullable().default(null),interval_minutes:z.number().int().min(5).max(10080).default(60),category_map:z.record(z.string().min(1).max(100),z.string().min(1).max(60)).default({})}),req.body);
  const url=new URL(input.url);requireThat(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search,'Usa HTTPS sin credenciales ni parámetros; configura la autenticación en el servidor.');
  requireThat(config.feedOrigins.includes(url.origin),'El operador debe autorizar este origen en FEED_ALLOWED_ORIGINS.',422,'feed_origin_required');
  const allowedCategories=new Set((await query('SELECT id FROM categories')).rows.map(c=>c.id));requireThat(Object.values(input.category_map).every(c=>allowedCategories.has(c)),'El mapeo contiene una categoría de destino desconocida.');
  const result=(await query('INSERT INTO catalog_sources(brand_id,url,credential_env,interval_minutes,category_map) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.org.brand_id,url.href,input.credential_env,input.interval_minutes,input.category_map])).rows[0];
  await audit({query},req,'source.requested',result.id);res.status(201).json(result);
});
sellerRouter.post('/sources/:id/run',verified,async(req,res)=>{
  const s=(await query(`UPDATE catalog_sources SET next_run_at=now() WHERE id=$1 AND brand_id=$2 AND approved AND enabled RETURNING id`,[id.parse(req.params.id),req.org.brand_id])).rows[0];requireThat(s,'Fuente no aprobada/activa.',409);res.json({message:'Ejecución programada para el worker.'});
});
sellerRouter.get('/settlements',async(req,res)=>res.json((await query(`SELECT s.*,(SELECT json_agg(json_build_object('order_id',o.id,'subtotal_cents',o.subtotal_cents,'shipping_cents',o.shipping_cents,'commission_cents',o.commission_cents,'refunded_cents',o.refunded_cents)) FROM settlement_orders so JOIN orders o ON o.id=so.order_id WHERE so.settlement_id=s.id) AS orders FROM settlements s WHERE brand_id=$1 ORDER BY created_at DESC`,[req.org.brand_id])).rows));
sellerRouter.get('/analytics',async(req,res)=>{
  const input=parse(z.object({from:z.iso.date().default(peruDay(new Date(Date.now()-30*86400000))),to:z.iso.date().default(peruDay())}),req.query);
  requireThat(input.from<=input.to,'Revisa el rango de fechas.');
  const rows=(await query(`SELECT ord.* FROM orders ord JOIN purchases p ON p.id=ord.purchase_id WHERE ord.brand_id=$1 AND p.payment_state IN ('approved','refunded','partially_refunded') AND ord.created_at>=($2::date::timestamp AT TIME ZONE 'America/Lima') AND ord.created_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Lima')`,[req.org.brand_id,input.from,input.to])).rows;
  const gross=rows.reduce((s,r)=>s+r.subtotal_cents,0),buyers=new Map(),days=new Map();
  for(const r of rows){buyers.set(r.buyer_id,(buyers.get(r.buyer_id)||0)+1);const date=peruDay(r.created_at),day=days.get(date)||{date,gross_products_cents:0,orders:0};day.gross_products_cents+=r.subtotal_cents;day.orders++;days.set(date,day);}
  const products=(await query(`SELECT oi.product_id,oi.snapshot->>'name' AS name,sum(oi.quantity)::int AS units,sum(oi.quantity*oi.unit_price_cents)::bigint AS gross_cents FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.id=ANY($1::uuid[]) GROUP BY oi.product_id,oi.snapshot->>'name' ORDER BY units DESC`,[rows.map(r=>r.id)])).rows;
  res.json({period:input,gross_products_cents:gross,refunds_cents:rows.reduce((s,r)=>s+r.refunded_cents,0),orders:rows.length,average_ticket_cents:rows.length?Math.round(gross/rows.length):0,units:products.reduce((s,r)=>s+r.units,0),repeat_buyers:[...buyers.values()].filter(n=>n>1).length,products,daily:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))});
});
sellerRouter.post('/orders/:id/fulfillment',verified,async(req,res)=>{
  const input=parse(z.object({state:z.enum(['preparing','shipped']),carrier:text.optional(),tracking_code:text.optional()}),req.body);
  await tx(async db=>{
    const o=await accessibleOrder(db,req,id.parse(req.params.id),{lock:true});requireThat(o.seller_id===req.org.id,'Pedido ajeno.',404);
    requireThat(['approved','partially_refunded'].includes(o.payment_state),'El pago no está confirmado.',409);
    requireThat((o.state==='confirmed'&&input.state==='preparing')||(o.state==='preparing'&&input.state==='shipped'),'Transición logística inválida.',409);
    if(input.state==='shipped') {requireThat(input.carrier&&input.tracking_code,'Indica transportista y seguimiento.');await db.query('INSERT INTO shipments(order_id,carrier,tracking_code) VALUES($1,$2,$3)',[o.id,input.carrier,input.tracking_code]);}
    await db.query('UPDATE orders SET state=$2 WHERE id=$1',[o.id,input.state]);
    await db.query('INSERT INTO order_events(order_id,actor_id,event,details) VALUES($1,$2,$3,$4)',[o.id,req.user.id,`fulfillment.${input.state}`,{carrier:input.carrier,tracking_code:input.tracking_code}]);
    await notify(db,o.buyer_id,'shipment',input.state==='shipped'?'Tu pedido fue despachado.':'La marca está preparando tu pedido.',`/pedidos/${o.id}`);
    await audit(db,req,'order.fulfillment',o.id,{state:input.state});
  });res.json({message:'Estado logístico actualizado.'});
});


sellerRouter.get('/shipments',async(req,res)=>res.json((await query(`SELECT o.id,o.state,o.created_at,b.name AS buyer_name,s.carrier,s.tracking_code,s.delivered_at
 FROM orders o JOIN organizations b ON b.id=o.buyer_id LEFT JOIN shipments s ON s.order_id=o.id
 WHERE o.brand_id=$1 AND o.state IN ('confirmed','preparing','shipped','delivered') ORDER BY o.created_at DESC LIMIT 300`,[req.org.brand_id])).rows));
sellerRouter.get('/incidents',async(req,res)=>res.json((await query(`SELECT i.*,o.buyer_id FROM incidents i JOIN orders o ON o.id=i.order_id WHERE o.brand_id=$1 ORDER BY i.created_at DESC LIMIT 300`,[req.org.brand_id])).rows));
sellerRouter.get('/buyers',async(req,res)=>res.json((await query(`SELECT b.id,b.name,count(*)::int AS orders,sum(o.subtotal_cents)::bigint AS gross_cents,max(o.created_at) AS latest_order
 FROM orders o JOIN organizations b ON b.id=o.buyer_id JOIN purchases p ON p.id=o.purchase_id
 WHERE o.brand_id=$1 AND p.payment_state IN ('approved','partially_refunded','refunded')
 GROUP BY b.id,b.name ORDER BY max(o.created_at) DESC LIMIT 300`,[req.org.brand_id])).rows));
