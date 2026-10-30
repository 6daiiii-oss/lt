import { normalizeRegion, regionName } from '../public/modules/regions.js';
import { phoneVerified } from '../server/phone.js';
import { feeBreakdown, buyerOrder } from '../server/pricing.js';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../server/db.js';
import { config } from '../server/config.js';
import { authenticated, orgRole, verified } from '../server/auth.js';
import { audit, cents, hash, id, notify, parse, quantity, requireThat, sumMoney, validateQuantity } from '../server/lib.js';


import {cartRows,quoteCart,lockBuyer,pendingCheckout} from '../server/commerce.js';
// Historical financial regression fixtures only; never mounted on the application.
export async function legacyCheckout(user,key){
 const info=(await query('SELECT * FROM users WHERE id=$1',[user.userId])).rows[0];const org=(await query('SELECT * FROM organizations WHERE id=$1',[user.orgId])).rows[0];
 const quote=quoteCart(await cartRows({query},user.orgId));const req={user:info,org,headers:{'idempotency-key':key},body:{address_id:user.addressId,receipt:{kind:'order_summary'},reviewed_total_cents:quote.total_cents,agree_to_conditions:true,sandbox:true}};
 let status=200,data;const res={status(n){status=n;return this;},json(v){data=v;}};
 try{requireThat(config.purchasesEnabled&&!config.production,'No disponible.',409,'purchases_unavailable');requireThat(info.phone_verified_at,'Verifica tu número.',403,'phone_unverified');requireThat(org.status==='approved','Negocio no aprobado.',403);await (async()=>{
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
})();return {status,data};}catch(e){return {status:e.status||422,data:{message:e.message,code:e.code,details:e.details}};}
}
