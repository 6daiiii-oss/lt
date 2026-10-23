import { normalizeRegion, regionName } from '../public/modules/regions.js';
import { phoneVerified } from './phone.js';
import { feeBreakdown, buyerOrder } from './pricing.js';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from './db.js';
import { config } from './config.js';
import { authenticated, orgRole, verified } from './auth.js';
import { audit, cents, hash, id, notify, parse, quantity, requireThat, sumMoney, validateQuantity } from './lib.js';

export async function lockBuyer(db,orgId) { return (await db.query('SELECT id,status FROM organizations WHERE id=$1 FOR UPDATE',[orgId])).rows[0]; }
export async function pendingCheckout(db,orgId) { return (await db.query(`SELECT id,expires_at,total_cents FROM checkouts WHERE organization_id=$1 AND state='pending' ORDER BY created_at DESC LIMIT 1`,[orgId])).rows[0]; }
export async function cartRows(db,orgId,lock=false) {
  return (await db.query(`SELECT ci.quantity,ci.quoted_price_cents,p.*,i.total,i.reserved,i.source_updated_at,
   b.name AS brand_name,b.organization_id AS seller_id,b.min_order_cents,b.shipping_cents,b.shipping_regions,b.shipping_policy,b.return_policy,b.preparation_days,b.terms_approved,o.status AS seller_status,
   (SELECT url FROM product_images WHERE product_id=p.id ORDER BY position LIMIT 1) AS image
   FROM carts cart JOIN cart_items ci ON ci.cart_id=cart.id JOIN products p ON p.id=ci.product_id JOIN inventory i ON i.product_id=p.id
   JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id
   WHERE cart.organization_id=$1 ORDER BY p.id ${lock?'FOR UPDATE OF ci,p,i,b,o':''}`,[orgId])).rows;
}
export function productIssues(p,n=p.quantity) {
  const issues=[];
  try {validateQuantity(p,n);} catch(e){issues.push(e.message);}
  if(p.status!=='published'||p.seller_status!=='approved'||!p.terms_approved) issues.push('Producto o marca no disponible para compra.');
  if(p.total-p.reserved<n) issues.push('Stock insuficiente.');
  if(Date.now()-new Date(p.source_updated_at).getTime()>config.stockMaxAgeHours*3600_000) issues.push('El stock necesita actualización del proveedor.');
  if(p.quoted_price_cents!==undefined&&p.quoted_price_cents!==p.wholesale_cents) issues.push('El precio cambió; vuelve a revisar el producto.');
  return issues;
}
export function quoteCart(rows,address) {
  const groups=new Map();
  for(const p of rows) {
    let group=groups.get(p.brand_id);
    if(!group) {group={brand_id:p.brand_id,brand_name:p.brand_name,subtotal_cents:0,shipping_cents:p.shipping_cents,min_order_cents:p.min_order_cents,shipping_regions:p.shipping_regions,shipping_policy:p.shipping_policy,return_policy:p.return_policy,items:[],issues:[]};groups.set(p.brand_id,group);}
    const issues=productIssues(p);
    group.items.push({product_id:p.id,name:p.name,sku:p.sku,variant:p.variant,quantity:p.quantity,wholesale_cents:p.wholesale_cents,quoted_price_cents:p.quoted_price_cents,moq:p.moq,pack_multiple:p.pack_multiple,available:p.total-p.reserved,source_updated_at:p.source_updated_at,issues});
    group.subtotal_cents=sumMoney([group.subtotal_cents,p.quantity*p.wholesale_cents]);
  }
  for(const g of groups.values()) {
    if(g.subtotal_cents<g.min_order_cents) g.issues.push(`Añade S/ ${((g.min_order_cents-g.subtotal_cents)/100).toFixed(2)} en productos de esta marca para completar su compra mínima.`);
    if(!g.shipping_regions.length) g.issues.push('El proveedor aún no configuró cobertura.');
    if(address&&!g.shipping_regions.map(normalizeRegion).includes(normalizeRegion(address.region))) g.issues.push(`Esta marca no envía a ${regionName(address.region)}. Zonas de envío: ${g.shipping_regions.map(regionName).join(', ')||'sin configurar'}. Elige otra dirección o consulta con la marca.`);
    if(address&&config.coverageRegions.length&&!config.coverageRegions.map(normalizeRegion).includes(normalizeRegion(address.region))) g.issues.push('La dirección está fuera de la cobertura de Lote.');
    g.total_cents=sumMoney([g.subtotal_cents,g.shipping_cents]);
  }
  const array=[...groups.values()],total=sumMoney(array.map(g=>g.total_cents));
  return {groups:array,total_cents:total,eligible:rows.length>0&&array.every(g=>!g.issues.length&&g.items.every(p=>!p.issues.length)),currency:'PEN',sandbox:true,tax_notice:'Prueba sin cobro. El resumen no es una boleta ni una factura.'};
}
export async function ensureCart(db,orgId) { return (await db.query('INSERT INTO carts(organization_id) VALUES($1) ON CONFLICT(organization_id) DO UPDATE SET updated_at=now() RETURNING id',[orgId])).rows[0].id; }
export const commerceRouter=Router();
commerceRouter.use(authenticated);
const purchasesAvailable=(req,res,next)=>{
  requireThat(config.purchasesEnabled&&!config.production,'No disponible. Las compras aún no están habilitadas.',409,'purchases_unavailable');
  next();
};
commerceRouter.get('/cart',orgRole('buyer'),async(req,res)=>{
  const addressId=req.query.address_id===undefined?null:id.parse(req.query.address_id);
  const address=addressId?(await query('SELECT id,region FROM addresses WHERE id=$1 AND organization_id=$2',[addressId,req.org.id])).rows[0]:null;
  if(addressId)requireThat(address,'Dirección no autorizada.',404);
  res.json({...quoteCart(await cartRows({query},req.org.id),address),address_id:address?.id||null,pendingCheckout:await pendingCheckout({query},req.org.id)});
});
commerceRouter.post('/cart/items',purchasesAvailable,verified,orgRole('buyer'),async(req,res)=>{
  const input=parse(z.object({product_id:id,quantity,expected_price_cents:cents}),req.body);
  await tx(async db=>{
    await lockBuyer(db,req.org.id);requireThat(!await pendingCheckout(db,req.org.id),'Finaliza o cancela el checkout pendiente.',409);
    const p=(await db.query(`SELECT p.*,i.total,i.reserved,i.source_updated_at,o.status AS seller_status,b.terms_approved FROM products p JOIN inventory i ON i.product_id=p.id JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id WHERE p.id=$1`,[input.product_id])).rows[0];
    requireThat(p,'Producto no encontrado.',404);const issues=productIssues(p,input.quantity);requireThat(!issues.length,'Revisa las condiciones del producto.',422,'cart_conditions',issues);
    requireThat(p.wholesale_cents===input.expected_price_cents,'El precio cambió. Revisa el producto.',409,'price_changed');
    const cartId=await ensureCart(db,req.org.id);
    await db.query(`INSERT INTO cart_items(cart_id,product_id,quantity,quoted_price_cents) VALUES($1,$2,$3,$4) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=$3,quoted_price_cents=$4`,[cartId,p.id,input.quantity,p.wholesale_cents]);
  });res.status(201).json({message:'Carrito actualizado.'});
});
commerceRouter.delete('/cart/items/:id',orgRole('buyer'),async(req,res)=>{
  await tx(async db=>{await lockBuyer(db,req.org.id);requireThat(!await pendingCheckout(db,req.org.id),'Cancela primero el checkout pendiente.',409);
    await db.query('DELETE FROM cart_items WHERE product_id=$1 AND cart_id IN(SELECT id FROM carts WHERE organization_id=$2)',[id.parse(req.params.id),req.org.id]);});res.json({message:'Producto eliminado.'});
});
commerceRouter.post('/checkout',purchasesAvailable,verified,phoneVerified,orgRole('buyer',{approved:true}),async(req,res)=>{
  requireThat(!config.production,'El checkout real está deshabilitado; falta proveedor y configuración comercial aprobada.',503,'real_checkout_disabled');
  const input=parse(z.object({address_id:id,receipt:z.object({kind:z.enum(['order_summary','boleta_requested','factura_requested']),legal_name:z.string().max(300).default(''),tax_id:z.string().max(30).default('')}),reviewed_total_cents:cents,agree_to_conditions:z.literal(true),sandbox:z.literal(true)}),req.body);
  if(input.receipt.kind==='factura_requested') requireThat(input.receipt.legal_name&&input.receipt.tax_id,'Indica los datos de comprobante solicitado.');
  const key=z.string().min(8).max(128).parse(req.headers['idempotency-key']),requestHash=hash(JSON.stringify(input));
  const result=await tx(async db=>{
    const currentBuyer=await lockBuyer(db,req.org.id);
    requireThat(currentBuyer.status==='approved','El negocio ya no está aprobado para comprar.',403);
    const prior=(await db.query('SELECT id,request_hash FROM checkouts WHERE organization_id=$1 AND idempotency_key=$2',[req.org.id,key])).rows[0];
    if(prior) {requireThat(prior.request_hash===requestHash,'La clave de idempotencia pertenece a otra solicitud.',409);return {checkout_id:prior.id,reused:true};}
    requireThat(!await pendingCheckout(db,req.org.id),'Ya existe un checkout pendiente; retómalo o cancélalo.',409,'checkout_pending');
    const address=(await db.query('SELECT recipient,line1,district,region,country,phone FROM addresses WHERE id=$1 AND organization_id=$2',[input.address_id,req.org.id])).rows[0];
    requireThat(address,'Dirección no autorizada.',422);
    const rows=await cartRows(db,req.org.id,true),quote=quoteCart(rows,address);
    const problems=quote.groups.flatMap(g=>[...g.issues.map(issue=>g.brand_name+': '+issue),...g.items.flatMap(p=>p.issues.map(issue=>p.name+': '+issue))]);
    requireThat(quote.eligible,problems[0]||'Tu bolsa está vacía. Añade un producto para continuar.',422,'cart_conditions',problems);
    requireThat(quote.total_cents===input.reviewed_total_cents,'El total cambió. Revisa el carrito antes de confirmar.',409,'total_changed',quote);
    const checkout=(await db.query(`INSERT INTO checkouts(organization_id,user_id,idempotency_key,request_hash,total_cents,address_snapshot,receipt_snapshot,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 minute') RETURNING *`,[req.org.id,req.user.id,key,requestHash,quote.total_cents,address,{...input.receipt,fiscal_document_issued:false},config.reservationMinutes])).rows[0];
    const purchase=(await db.query('INSERT INTO purchases(checkout_id,organization_id,total_cents) VALUES($1,$2,$3) RETURNING id',[checkout.id,req.org.id,quote.total_cents])).rows[0];
    for(const g of quote.groups) {
      // Buyer row lock serializes checkouts. Only delivered, non-fully-refunded
      // orders establish a relationship; failed/cancelled/reserved orders do not.
      const recurrent=(await db.query(`SELECT 1 FROM orders o JOIN purchases p ON p.id=o.purchase_id
        WHERE o.buyer_id=$1 AND o.brand_id=$2 AND o.state='delivered'
        AND o.refunded_cents<o.total_cents AND p.payment_state IN ('approved','partially_refunded') LIMIT 1`,[req.org.id,g.brand_id])).rowCount>0;
      const fees=feeBreakdown(g.subtotal_cents,g.shipping_cents,recurrent);
      const bps=fees.basis_points,markupCents=fees.service_total_cents;
      const order=(await db.query(`INSERT INTO orders(purchase_id,brand_id,buyer_id,subtotal_cents,shipping_cents,commission_bps,commission_cents,total_cents,policy_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[purchase.id,g.brand_id,req.org.id,g.subtotal_cents,g.shipping_cents,bps,markupCents,g.total_cents,{shipping:g.shipping_policy,returns:g.return_policy,minimum_cents:g.min_order_cents,tax:'included_18_percent_assumed',pricing:'supplier_final_price_v2',commission:'seven_percent_product_gross_service_igv_included_processing_buyer',fees}])).rows[0];
      for(const item of g.items) {
        const p=rows.find(p=>p.id===item.product_id);
        const updated=await db.query('UPDATE inventory SET reserved=reserved+$2,updated_at=now() WHERE product_id=$1 AND total-reserved>=$2 RETURNING product_id',[p.id,p.quantity]);
        requireThat(updated.rowCount,'Otra tienda acaba de reservar este stock.',409,'stock_conflict');
        await db.query('INSERT INTO inventory_reservations(checkout_id,product_id,quantity,expires_at) VALUES($1,$2,$3,$4)',[checkout.id,p.id,p.quantity,checkout.expires_at]);
        await db.query('INSERT INTO inventory_movements(product_id,checkout_id,kind,quantity,reference) VALUES($1,$2,$3,$4,$5)',[p.id,checkout.id,'reserved',p.quantity,`reserve:${checkout.id}:${p.id}`]);
        await db.query(`INSERT INTO order_items(order_id,product_id,quantity,unit_price_cents,snapshot) VALUES($1,$2,$3,$4,$5)`,[order.id,p.id,p.quantity,p.wholesale_cents,{name:p.name,variant:p.variant,sku:p.sku,brand_name:p.brand_name,retail_cents:p.retail_cents,moq:p.moq,pack_multiple:p.pack_multiple,tax_applied:'included_18_percent_assumed',same_tax_basis:p.same_tax_basis,wholesale_cents:p.wholesale_cents}]);
      }
      await db.query(`INSERT INTO order_events(order_id,actor_id,event) VALUES($1,$2,'checkout.reserved')`,[order.id,req.user.id]);
    }
    const attempt=(await db.query(`INSERT INTO payment_attempts(checkout_id,provider,amount_cents) VALUES($1,'sandbox',$2) RETURNING id`,[checkout.id,quote.total_cents])).rows[0];
    await audit(db,req,'checkout.created',checkout.id,{sandbox:true,total_cents:quote.total_cents});
    return {checkout_id:checkout.id,purchase_id:purchase.id,payment_attempt_id:attempt.id,expires_at:checkout.expires_at,sandbox:true};
  });res.status(result.reused?200:201).json(result);
});
commerceRouter.get('/checkout/:id',orgRole('buyer'),async(req,res)=>{
  const checkout=(await query(`SELECT c.*,pa.id AS payment_attempt_id,pa.state AS payment_attempt_state,p.id AS purchase_id FROM checkouts c JOIN payment_attempts pa ON pa.checkout_id=c.id JOIN purchases p ON p.checkout_id=c.id WHERE c.id=$1 AND c.organization_id=$2`,[id.parse(req.params.id),req.org.id])).rows[0];
  requireThat(checkout,'Checkout no encontrado.',404);
  delete checkout.request_hash;delete checkout.idempotency_key;
  res.json({...checkout,orders:(await query('SELECT id,brand_id,total_cents,state FROM orders WHERE purchase_id=$1',[checkout.purchase_id])).rows,sandbox:true});
});
export async function accessibleOrder(db,req,orderId,{lock=false}={}) {
  const order=(await db.query(`SELECT ord.*,b.organization_id AS seller_id,b.name AS brand_name,p.payment_state,p.checkout_id,c.address_snapshot,c.receipt_snapshot,buyer.name AS buyer_name,buyer.contact_email AS buyer_email
    FROM orders ord JOIN organizations buyer ON buyer.id=ord.buyer_id JOIN brands b ON b.id=ord.brand_id JOIN purchases p ON p.id=ord.purchase_id JOIN checkouts c ON c.id=p.checkout_id
    WHERE ord.id=$1 ${lock?'FOR UPDATE OF ord':''}`,[orderId])).rows[0];
  requireThat(order&&(req.user.is_admin||order.buyer_id===req.org?.id||order.seller_id===req.org?.id),'Pedido no encontrado.',404);return order;
}
commerceRouter.get('/orders',async(req,res)=>{
  requireThat(req.org,'Organización requerida.',403);
  const input=parse(z.object({state:z.string().max(40).optional(),q:z.string().max(80).optional(),from:z.iso.date().optional(),to:z.iso.date().optional()}),req.query);
  const rows=(await query(`SELECT ord.*,b.name AS brand_name,buyer.name AS buyer_name,p.payment_state FROM orders ord JOIN organizations buyer ON buyer.id=ord.buyer_id JOIN brands b ON b.id=ord.brand_id JOIN purchases p ON p.id=ord.purchase_id
    WHERE (ord.buyer_id=$1 OR b.organization_id=$1) AND ($2::text IS NULL OR ord.state=$2) AND ($3::text IS NULL OR ord.id::text ILIKE '%'||$3||'%' OR b.name ILIKE '%'||$3||'%' OR buyer.name ILIKE '%'||$3||'%')
    AND ($4::date IS NULL OR ord.created_at >= ($4::date::timestamp AT TIME ZONE 'America/Lima')) AND ($5::date IS NULL OR ord.created_at < (($5::date+1)::timestamp AT TIME ZONE 'America/Lima')) ORDER BY ord.created_at DESC LIMIT 200`,[req.org.id,input.state||null,input.q||null,input.from||null,input.to||null])).rows;res.json(rows.map(o=>!req.user.is_admin&&o.buyer_id===req.org.id?buyerOrder(o):o));
});
commerceRouter.get('/orders/:id',async(req,res)=>{
  const order=await accessibleOrder({query},req,id.parse(req.params.id));
  const [items,events,shipments,incidents,ledger]=await Promise.all([
    query('SELECT oi.*,r.id AS review_id FROM order_items oi LEFT JOIN reviews r ON r.order_item_id=oi.id WHERE order_id=$1',[order.id]),
    query('SELECT id,event,details,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at',[order.id]),
    query('SELECT * FROM shipments WHERE order_id=$1',[order.id]),query('SELECT * FROM incidents WHERE order_id=$1 ORDER BY created_at DESC',[order.id]),
    query('SELECT kind,amount_cents,reference,created_at FROM ledger_entries WHERE order_id=$1 ORDER BY created_at',[order.id])]);
  // Commission and internal ledger are restricted to seller/admin.
  const isBuyer=!req.user.is_admin&&req.org.id===order.buyer_id;
  res.json({... (isBuyer?buyerOrder(order):order),items:items.rows,events:events.rows,shipment:shipments.rows[0]||null,incidents:incidents.rows,ledger:(!req.user.is_admin&&req.org.id===order.buyer_id)?[]:ledger.rows});
});
commerceRouter.post('/orders/:id/reorder',purchasesAvailable,verified,orgRole('buyer'),async(req,res)=>{
  const input=parse(z.object({confirm:z.boolean().default(false),quote_hash:z.string().optional()}),req.body);
  const result=await tx(async db=>{
    await lockBuyer(db,req.org.id);const order=await accessibleOrder(db,req,id.parse(req.params.id));requireThat(order.buyer_id===req.org.id,'Solo la tienda compradora puede recomprar.',403);
    const items=(await db.query(`SELECT oi.quantity,oi.unit_price_cents AS previous_price_cents,oi.snapshot,p.*,i.total,i.reserved,i.source_updated_at,o.status AS seller_status,b.terms_approved
      FROM order_items oi JOIN products p ON p.id=oi.product_id JOIN inventory i ON i.product_id=p.id JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id WHERE oi.order_id=$1 ORDER BY p.id`,[order.id])).rows;
    const quote=items.map(p=>({product_id:p.id,name:p.name,quantity:p.quantity,previous_price_cents:p.previous_price_cents,current_price_cents:p.wholesale_cents,moq:p.moq,pack_multiple:p.pack_multiple,available:p.total-p.reserved,status:p.status,issues:productIssues(p),changed:p.previous_price_cents!==p.wholesale_cents||p.snapshot.moq!==p.moq||p.snapshot.pack_multiple!==p.pack_multiple}));
    const quoteHash=hash(JSON.stringify(quote));
    if(input.confirm) {
      requireThat(input.quote_hash===quoteHash,'La recompra cambió; revisa de nuevo.',409);
      requireThat(quote.every(p=>!p.issues.length),'Hay productos no disponibles o con mínimos incompatibles.',422,'reorder_unavailable',quote);
      requireThat(!await pendingCheckout(db,req.org.id),'Cancela primero el checkout pendiente.',409);
      const cart=await ensureCart(db,req.org.id);
      for(const p of quote) await db.query('INSERT INTO cart_items(cart_id,product_id,quantity,quoted_price_cents) VALUES($1,$2,$3,$4) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=$3,quoted_price_cents=$4',[cart,p.product_id,p.quantity,p.current_price_cents]);
    }
    return {items:quote,quote_hash:quoteHash,added:input.confirm};
  });res.json(result);
});

