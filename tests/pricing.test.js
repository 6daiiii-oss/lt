import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeBreakdown, paymentSurchargeCents } from '../public/modules/fees.js';
import { priceForBuyer, buyerOrder } from '../server/pricing.js';
test('7% total con IGV incluido; comprador cubre procesamiento sandbox',()=>{
 const f=feeBreakdown(100000);
 assert.equal(f.service_total_cents,7000);
 assert.equal(f.service_cents,5932);
 assert.equal(f.service_tax_cents,1068);
 assert.equal(f.seller_estimate_cents,93000);
 assert.equal(f.processing_estimate_cents,3627);
 assert.equal(f.buyer_total_estimate_cents,103627);
 assert.deepEqual(feeBreakdown(100000,0,true),f);
 assert.equal(feeBreakdown(100000,5000).service_total_cents,7000);
 assert.equal(paymentSurchargeCents(100000),3627);
});
test('reparto de comision y conservacion de dinero por proveedor',()=>{
 for(const n of [1,105,10000,100000,99999999]) {
  const f=feeBreakdown(n,300);
  assert.equal(f.products_base_cents+f.products_tax_cents,n);
  assert.equal(f.service_cents+f.service_tax_cents,f.service_total_cents);
  assert.equal(f.seller_estimate_cents+f.service_total_cents,n+300);
  assert.equal(f.buyer_total_estimate_cents,n+300+f.processing_estimate_cents);
  assert.equal(priceForBuyer(n),n);
 }
 const o=buyerOrder({id:'x',commission_cents:100,commission_bps:700,policy_snapshot:{fees:feeBreakdown(1000),commission:'internal',pricing:'internal',shipping:'public'}});
 assert.deepEqual(o,{id:'x',policy_snapshot:{shipping:'public'}});
 for(const n of [-1,NaN,1.2,Infinity,100000001])assert.throws(()=>feeBreakdown(n));
});
