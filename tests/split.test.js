import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSplit } from '../server/split.js';
test('split conserva el dinero y distribuye centavos de forma estable sin ejecutar transferencias',()=>{
 const groups=[{seller_id:'b',products_cents:100,shipping_cents:0},{seller_id:'a',products_cents:100,shipping_cents:0},{seller_id:'c',products_cents:100,shipping_cents:0}];
 const plan=planSplit(groups,2);assert.equal(plan.buyer_cents,302);assert.equal(plan.processor_cents,2);assert.equal(plan.platform_cents,21);assert.equal(plan.executable,false);
 assert.equal(plan.sellers.reduce((n,s)=>n+s.seller_cents,0)+plan.platform_cents+plan.processor_cents,plan.buyer_cents);
 assert.deepEqual(Object.fromEntries(plan.sellers.map(s=>[s.seller_id,s.processing_cents])),{b:1,a:1,c:0});
 assert.deepEqual(planSplit([...groups].reverse(),2).sellers.sort((a,b)=>a.seller_id.localeCompare(b.seller_id)),plan.sellers.sort((a,b)=>a.seller_id.localeCompare(b.seller_id)));
 for(const input of [[],[groups[0],groups[0]],[{...groups[0],products_cents:-1}]])assert.throws(()=>planSplit(input,1));
 assert.throws(()=>planSplit(groups,undefined));assert.throws(()=>planSplit(groups,-1));
});
test('split de dos proveedores: comisión solo sobre productos y procesamiento cotizado al comprador',()=>{
 const result=planSplit([{seller_id:'a',products_cents:100000,shipping_cents:1000},{seller_id:'b',products_cents:50000,shipping_cents:2000}],3500);
 assert.equal(result.platform_cents,10500);assert.equal(result.buyer_cents,156500);
 assert.equal(result.sellers[0].seller_cents,94000);assert.equal(result.sellers[1].seller_cents,48500);
 assert.equal(result.sellers.reduce((n,s)=>n+s.processing_cents,0),3500);
});
