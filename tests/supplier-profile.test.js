import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import sharp from 'sharp';
import {isolatedDatabase,fixtures} from './helpers.js';
test('perfil opcional: conserva imágenes, impide usar fotos ajenas y privadas, y permite quitarlas',async()=>{
 const isolated=await isolatedDatabase();let db,server;
 try{
  db=await import('../server/db.js');await db.migrate();await db.migrate();const a=await fixtures(db);
  const {config}=await import('../server/config.js');const {createApp}=await import('../server/app.js');server=createApp({testing:true}).listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,body,who=a.sellerA,method='PUT',type='application/json')=>{const r=await fetch(base+'/api'+path,{method,headers:{Origin:config.origin,Cookie:who.cookie,'X-CSRF-Token':who.csrf,'X-Organization-Id':who.orgId,'Content-Type':type},body:type==='application/json'?JSON.stringify(body):body});return {status:r.status,data:await r.json()};};
  const image=await sharp({create:{width:40,height:20,channels:3,background:'#123456'}}).png().toBuffer();
  const upload=(purpose,who)=>request('/uploads?purpose='+purpose,image,who,'POST','image/png');
  const own=await upload('profile',a.sellerA),other=await upload('profile',a.sellerB),privatePhoto=await upload('verification',a.sellerA);
  assert.equal(own.status,201);assert.equal((await upload('profile',a.buyerA)).status,403);
  const body={story:'Descripción de mi negocio',avatar_id:own.data.id,banner_id:own.data.id};
  assert.equal((await request('/seller/profile',body)).status,200);
  let profile=await fetch(base+'/api/brands/'+a.sellerA.brandId).then(r=>r.json());assert.equal(profile.avatar_id,own.data.id);assert.equal(profile.story,body.story);
  assert.equal((await fetch(base+own.data.url)).status,200);
  for(const id of [other.data.id,privatePhoto.data.id])assert.equal((await request('/seller/profile',{...body,banner_id:id})).status,422);
  assert.equal((await request('/seller/profile',{story:'',avatar_id:null,banner_id:null})).status,200);
  profile=await fetch(base+'/api/brands/'+a.sellerA.brandId).then(r=>r.json());assert.equal(profile.avatar_id,null);assert.equal(profile.banner_id,null);
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.pool.end();await isolated.drop();}
});
