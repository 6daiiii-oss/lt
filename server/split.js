import { feeBreakdown,FEE_POLICY } from '../public/modules/fees.js';
// A settlement plan is not a transfer. Only a contracted gateway can execute it.
// Processing is an explicitly quoted final amount paid by the buyer.
export function planSplit(groups,processingCents){
 if(!Array.isArray(groups)||!groups.length||groups.length>100)throw new RangeError('Proveedores inválidos');
 if(!Number.isSafeInteger(processingCents)||processingCents<0||processingCents>100_000_000)throw new RangeError('Cotización de procesamiento inválida');
 const ids=new Set();
 const entries=groups.map(g=>{
  if(typeof g.seller_id!=='string'||!g.seller_id||g.seller_id.length>100||ids.has(g.seller_id))throw new RangeError('Proveedor duplicado o inválido');ids.add(g.seller_id);
  const fees=feeBreakdown(g.products_cents,g.shipping_cents);
  if(g.products_cents<=0)throw new RangeError('El pedido debe contener productos');
  return {seller_id:g.seller_id,products_cents:g.products_cents,shipping_cents:g.shipping_cents,commission_cents:fees.service_total_cents,seller_cents:fees.seller_estimate_cents,processing_cents:0};
 });
 const total=entries.reduce((n,e)=>n+e.products_cents+e.shipping_cents,0);if(total>100_000_000)throw new RangeError('Total fuera de límite');
 const remainders=entries.map(e=>{const n=BigInt(processingCents)*BigInt(e.products_cents+e.shipping_cents);e.processing_cents=Number(n/BigInt(total));return {entry:e,remainder:n%BigInt(total)};}).sort((a,b)=>a.remainder===b.remainder?a.entry.seller_id.localeCompare(b.entry.seller_id):a.remainder>b.remainder?-1:1);
 const leftover=processingCents-entries.reduce((n,e)=>n+e.processing_cents,0);for(let i=0;i<leftover;i++)remainders[i].entry.processing_cents++;
 return {policy_version:FEE_POLICY.version,currency:'PEN',buyer_cents:total+processingCents,processor_cents:processingCents,platform_cents:entries.reduce((n,e)=>n+e.commission_cents,0),sellers:entries,executable:false};
}
