// All amounts are integer PEN cents. Tariff is an estimate, never a live charge.
export const FEE_POLICY = Object.freeze({version:'2026-10-20',first_bps:1000,repeat_bps:700,tax_bps:1800});
const roundRatio=(n,d)=>Number((BigInt(n)+BigInt(Math.floor(d/2)))/BigInt(d));
export function feeBreakdown(grossCents,shippingCents=0,recurrent=false) {
  for(const n of [grossCents,shippingCents])if(!Number.isSafeInteger(n)||n<0||n>100_000_000)throw new RangeError('Importe inválido');
  const base=roundRatio(BigInt(grossCents)*100n,118);
  const bps=recurrent?FEE_POLICY.repeat_bps:FEE_POLICY.first_bps;
  const service=roundRatio(BigInt(base)*BigInt(bps),10000);
  const serviceTax=roundRatio(BigInt(service)*18n,100);
  const total=service+serviceTax;
  const processingBase=roundRatio(BigInt(grossCents+shippingCents)*349n,10000)+100;
  const processing=processingBase+roundRatio(BigInt(processingBase)*18n,100);
  return {version:FEE_POLICY.version,recurrent,basis_points:bps,products_base_cents:base,products_tax_cents:grossCents-base,
    service_cents:service,service_tax_cents:serviceTax,service_total_cents:total,
    processing_estimate_cents:processing,processing_assumption:'3.49% + S/1 + 18% IGV; confirmar cotización split',
    seller_before_processing_cents:grossCents+shippingCents-total,
    seller_estimate_cents:grossCents+shippingCents-total-processing,
    tax_assumption:'Productos gravados al 18%, precio incluye IGV; sin comisión sobre envío',estimated:true};
}
