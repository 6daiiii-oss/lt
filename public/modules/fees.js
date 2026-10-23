// Integer PEN cents; policy is frozen into each new order. Existing snapshots stay unchanged.
export const FEE_POLICY=Object.freeze({version:'2026-10-22',first_bps:700,repeat_bps:700,tax_bps:1800,processing_payer:'buyer',commission_includes_tax:true});
const ratio=(n,d)=>Number((BigInt(n)+BigInt(Math.floor(d/2)))/BigInt(d));
export function feeBreakdown(grossCents,shippingCents=0,recurrent=false,quotedProcessingCents=null) {
 for(const n of [grossCents,shippingCents])if(!Number.isSafeInteger(n)||n<0||n>100_000_000)throw new RangeError('Importe inválido');
 if(quotedProcessingCents!==null&&(!Number.isSafeInteger(quotedProcessingCents)||quotedProcessingCents<0||quotedProcessingCents>100_000_000))throw new RangeError('Procesamiento inválido');
 const base=ratio(BigInt(grossCents)*100n,118),total=ratio(BigInt(grossCents)*700n,10000),service=ratio(BigInt(total)*100n,118);
 const processing=quotedProcessingCents??0,seller=grossCents+shippingCents-total;
 return {version:FEE_POLICY.version,recurrent,basis_points:700,products_base_cents:base,products_tax_cents:grossCents-base,service_cents:service,service_tax_cents:total-service,service_total_cents:total,processing_estimate_cents:processing,processing_payer:'buyer',processing_quoted:quotedProcessingCents!==null,processing_assumption:quotedProcessingCents===null?'Tarifa de pasarela pendiente de cotización; no se ha añadido ningún cargo':'Importe de ejemplo indicado para el comprador; confirmar con la pasarela',seller_before_processing_cents:seller,seller_estimate_cents:seller,buyer_total_estimate_cents:grossCents+shippingCents+processing,tax_assumption:'Comisión del 7% sobre productos, con IGV del servicio incluido; sin comisión sobre envío. Desglose de productos supone IGV del 18%.',estimated:true};
}
