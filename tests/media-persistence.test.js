import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { isolatedDatabase, fixtures, product } from './helpers.js';

test('photos survive a missing upload directory, remain private when needed, and keep legacy files',async()=>{
  const isolated=await isolatedDatabase();
  let db,server;
  try {
    db=await import('../server/db.js');await db.migrate();
    const {config}=await import('../server/config.js');
    const accounts=await fixtures(db);
    const {createApp}=await import('../server/app.js');
    server=createApp({testing:true}).listen(0,'127.0.0.1');await once(server,'listening');
    let base='http://127.0.0.1:'+server.address().port;
    const image=await sharp({create:{width:20,height:20,channels:3,background:'#009988'}}).png().toBuffer();
    const upload=async(purpose,user=accounts.sellerA)=> {
      const response=await fetch(base+'/api/uploads?purpose='+purpose,{method:'POST',headers:{Origin:config.origin,Cookie:user.cookie,'X-CSRF-Token':user.csrf,'X-Organization-Id':user.orgId,'Content-Type':'image/png'},body:image});
      return {status:response.status,data:await response.json()};
    };
    const photo=await upload('product');assert.equal(photo.status,201);
    const row=(await db.query('SELECT * FROM attachments WHERE id=$1',[photo.data.id])).rows[0];
    assert.ok(Buffer.isBuffer(row.content));assert.equal(row.content.length,row.size);
    const p=await product(db,accounts.sellerA,{images:[{url:photo.data.url,alt:'Foto de prueba'}]});
    let response=await fetch(base+'/api/products/'+p.id);assert.equal(response.status,200);assert.equal((await response.json()).images[0].url,photo.data.url);
    await new Promise(resolve=>server.close(resolve));server=null;
    config.storage=join(config.storage,'empty-server');
    server=createApp({testing:true}).listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;
    response=await fetch(base+photo.data.url);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/webp/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),row.content);
    assert.equal((await upload('product',accounts.buyerA)).status,403);
    const privatePhoto=await upload('verification');assert.equal(privatePhoto.status,201);
    assert.equal((await fetch(base+'/media/'+privatePhoto.data.id)).status,404);
    assert.equal((await fetch(base+privatePhoto.data.url)).status,401);
    response=await fetch(base+privatePhoto.data.url,{headers:{Cookie:accounts.sellerB.cookie,'X-Organization-Id':accounts.sellerB.orgId}});assert.equal(response.status,404);
    response=await fetch(base+privatePhoto.data.url,{headers:{Cookie:accounts.sellerA.cookie,'X-Organization-Id':accounts.sellerA.orgId}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private/);
    const key=randomUUID()+'.webp';await mkdir(config.storage,{recursive:true});await writeFile(join(config.storage,key),row.content);
    const legacy=(await db.query("INSERT INTO attachments(organization_id,file_key,mime,size,public) VALUES($1,$2,'image/webp',$3,true) RETURNING id",[accounts.sellerA.orgId,key,row.size])).rows[0];
    assert.equal((await fetch(base+'/media/'+legacy.id)).status,200);
    assert.deepEqual((await db.query('SELECT content FROM attachments WHERE id=$1',[legacy.id])).rows[0].content,row.content);
    const missing=(await db.query("INSERT INTO attachments(organization_id,file_key,mime,size,public) VALUES($1,$2,'image/webp',1,true) RETURNING id",[accounts.sellerA.orgId,randomUUID()+'.webp'])).rows[0];
    response=await fetch(base+'/media/'+missing.id);assert.equal(response.status,404);assert.match((await response.json()).message,/Vuelve a subirla/);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(db)await db.pool.end();
    await isolated.drop();
  }
});
