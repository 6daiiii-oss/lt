import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sellerProgress} from '../public/modules/seller-journey.js';
test('registro básico no equivale a negocio completo ni revisión enviada',()=>{
 const steps=sellerProgress({legal_name:'Ana',phone:'123',business_type:'Proveedor',verifications:[],brand:{}},[],{});
 assert.equal(steps.filter(s=>s.done).length,0);
 assert.equal(steps.find(s=>s.key==='business').href,'/cuenta/perfil');
});
test('revisión pendiente, corrección y aprobación se distinguen sin indicadores locales',()=>{
 const org={status:'pending',verifications:[{status:'pending'}],brand:{}};
 assert.equal(sellerProgress(org,[],{}).find(s=>s.key==='review').done,true);
 assert.equal(sellerProgress(org,[],{}).find(s=>s.key==='approval').done,false);
 org.verifications=[{status:'correction'},{status:'pending'}];
 assert.equal(sellerProgress(org,[],{}).find(s=>s.key==='review').done,false);
 org.status='approved';assert.equal(sellerProgress(org,[],{}).find(s=>s.key==='approval').done,true);
});
test('productos archivados no completan el catálogo; condiciones sin confirmar tampoco',()=>{
 const org={legal_name:'Ana',business_type:'Proveedor',phone:'123',contact_email:'a@example.invalid',origin_address:'Origen',brand:{location:'Lima',shipping_regions:['lima'],shipping_policy:'Entrega',return_policy:'Incidencias',terms_approved:false}};
 let steps=sellerProgress(org,[{status:'archived'}],{phone_verified_at:'2026-10-25'});
 assert.equal(steps.find(s=>s.key==='phone').done,true);assert.equal(steps.find(s=>s.key==='products').done,false);assert.equal(steps.find(s=>s.key==='business').done,false);
 org.brand.terms_approved=true;steps=sellerProgress(org,[{status:'pending'}],{});assert.equal(steps.find(s=>s.key==='business').done,true);assert.equal(steps.find(s=>s.key==='products').done,true);
});
