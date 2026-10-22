// Sandbox only: all amounts are integer PEN cents. No real payment provider connected.
export const FEE_POLICY=Object.freeze({version:'2026-10-22',commission_bps:700,tax_bps:1800,processing_bps:350});
const roundRatio=(n,d)=>Number((BigInt(n)+BigInt(Math.floor(d/2)))/BigInt(d));
export function paymentSurchargeCents(amount) {
  if(!Number.isSafeInteger(amount)||amount<0||amount>100_000_000)throw new RangeError('Importe inválido');
  const bps=BigInt(FEE_POLICY.processing_bps),den=10000n-bps;
  return Number((BigInt(amount)*bps+den-1n)/den);
}
export function feeBreakdown(grossCents,shippingCents=0,_recurrent=false) {
  for(const n of [grossCents,shippingCents])if(!Number.isSafeInteger(n)||n<0||n>100_000_000)throw new RangeError('Importe inválido');
  const productBase=roundRatio(BigInt(grossCents)*100n,118);
  const total=roundRatio(BigInt(grossCents)*BigInt(FEE_POLICY.commission_bps),10000);
  const service=roundRatio(BigInt(total)*100n,118);
  const processing=paymentSurchargeCents(grossCents+shippingCents);
  return {version:FEE_POLICY.version,recurrent:false,basis_points:FEE_POLICY.commission_bps,
    products_base_cents:productBase,products_tax_cents:grossCents-productBase,
    service_cents:service,service_tax_cents:total-service,service_total_cents:total,
    processing_estimate_cents:processing,
    processing_assumption:'Sandbox: 3.5% IGV incluido sobre el importe total capturado; comprador paga el recargo. Tarifa real no confirmada.',
    seller_before_processing_cents:grossCents+shippingCents-total,
    seller_estimate_cents:grossCents+shippingCents-total,
    buyer_total_estimate_cents:grossCents+shippingCents+processing,
    tax_assumption:'7% total con IGV de Vendo incluido sobre precio final de productos, no sobre envio. Validacion tributaria pendiente.',estimated:true};
}
