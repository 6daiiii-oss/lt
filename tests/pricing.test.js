import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeBreakdown } from '../public/modules/fees.js';
import { priceForBuyer, buyerOrder } from '../server/pricing.js';
test('S/1000: 7% incluye IGV y procesamiento corresponde al comprador',()=>{
  const first=feeBreakdown(100000),repeat=feeBreakdown(100000,0,true);
  assert.equal(first.products_base_cents,84746);
  assert.equal(first.service_cents,5932);assert.equal(first.service_tax_cents,1068);
  assert.equal(first.service_total_cents,7000);
  assert.equal(first.processing_estimate_cents,0);assert.equal(first.processing_quoted,false);
  assert.equal(first.seller_estimate_cents,93000);
  assert.equal(repeat.service_cents,5932);assert.equal(repeat.service_tax_cents,1068);
  assert.equal(repeat.service_total_cents,7000);assert.equal(repeat.seller_estimate_cents,93000);
  assert.equal(feeBreakdown(100000,5000).service_total_cents,first.service_total_cents);
  const quoted=feeBreakdown(100000,5000,false,3500);
  assert.equal(quoted.processing_estimate_cents,3500);assert.equal(quoted.seller_estimate_cents,98000);assert.equal(quoted.buyer_total_estimate_cents,108500);
});
test('money conservation, no buyer markup, no supplier fee leakage',()=>{
  for(const n of [1,105,10000,100000,99999999])for(const repeat of [true,false]) {
    const f=feeBreakdown(n,300,repeat);
    assert.equal(f.products_base_cents+f.products_tax_cents,n);
    assert.equal(f.service_cents+f.service_tax_cents,f.service_total_cents);
    assert.equal(f.seller_estimate_cents+f.service_total_cents+f.processing_estimate_cents,n+300);
    assert.equal(priceForBuyer(n),n);
  }
  const o=buyerOrder({id:'x',commission_cents:100,commission_bps:1000,policy_snapshot:{fees:feeBreakdown(1000),commission:'internal',pricing:'internal',shipping:'public'}});
  assert.deepEqual(o,{id:'x',policy_snapshot:{shipping:'public'}});
  for(const n of [-1,NaN,1.2,Infinity,100000001])assert.throws(()=>feeBreakdown(n));
});
