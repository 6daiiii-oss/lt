import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { query, tx } from './db.js';
import { config } from './config.js';
import { hash, requireThat } from './lib.js';
import { applyImport, stageImport } from './imports.js';

export function publicAddress(address) {
  try { return ipaddr.process(address).range()==='unicast'; }catch{return false;}
}
export async function fetchAuthorizedFeed(source) {
  const url=new URL(source.url);
  requireThat(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&config.feedOrigins.includes(url.origin),'Origen no autorizado.',403);
  const addresses=await lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true});
  requireThat(addresses.length>0&&addresses.every(a=>publicAddress(a.address)),'Destino privado o reservado rechazado.',403);
  const credential=source.credential_env?process.env[source.credential_env]:null;
  if(source.credential_env) requireThat(/^LOTE_FEED_[A-Z0-9_]+$/.test(source.credential_env)&&credential,'Credencial de feed no configurada.',503);
  const selected=addresses[0];
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{Accept:'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},
      signal:AbortSignal.timeout(15000),lookup:(host,options,cb)=>options.all?cb(null,[selected]):cb(null,selected.address,selected.family)},response=>{
      // Redirects are deliberately rejected, including redirects to a permitted origin.
      if(response.statusCode!==200||!response.headers['content-type']?.includes('application/json')) {response.resume();reject(new Error('Feed sin respuesta JSON HTTP 200.'));return;}
      let bytes=0;const chunks=[];
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>config.importMaxBytes) request.destroy(new Error('Feed supera el límite de tamaño.'));else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('JSON de feed inválido.'));}});
    });request.on('error',reject);
  });
}
export async function synchronizeSource(source,fetchFeed=fetchAuthorizedFeed) {
  const run=(await query(`INSERT INTO sync_runs(source_id,state) VALUES($1,'running') RETURNING id`,[source.id])).rows[0];
  try {
    const payload=await fetchFeed(source);
    const {products}=z.object({mode:z.literal('incremental'),products:z.array(z.unknown()).max(config.importMaxRows)}).parse(payload);
    for(const p of products) requireThat(p&&typeof p.external_id==='string'&&typeof p.updated_at==='string','El feed requiere external_id y updated_at por fila.',422);
    let validationFailed=false;
    await tx(async db=>{
      const current=(await db.query(`SELECT s.*,o.status AS org_status,b.organization_id FROM catalog_sources s JOIN brands b ON b.id=s.brand_id JOIN organizations o ON o.id=b.organization_id WHERE s.id=$1 FOR UPDATE OF s`,[source.id])).rows[0];
      requireThat(current.approved&&current.enabled&&current.org_status==='approved','Fuente o marca no aprobada.',403);
      if(products.length) {
        const req={org:{id:current.organization_id,brand_id:source.brand_id},user:null};
        const job=await stageImport(db,req,products.map(p=>({...p,category_id:current.category_map[p.category_id||p.category]||p.category_id,submit_for_review:true})),{sourceId:source.id,key:`feed:${source.id}:${hash(JSON.stringify(products))}`});
        if(job.state==='invalid'){validationFailed=true;return;}
        await applyImport(db,req,job.id,{sourceId:source.id});
      }
      await db.query(`UPDATE catalog_sources SET last_run_at=now(),next_run_at=now()+interval_minutes*interval '1 minute',failures=0,last_error=NULL,lease_until=NULL WHERE id=$1`,[source.id]);
      await db.query(`UPDATE sync_runs SET state='succeeded',row_count=$2,finished_at=now() WHERE id=$1`,[run.id,products.length]);
    });requireThat(!validationFailed,'El lote de feed tiene filas inválidas; consulta la previsualización.',422);return {rows:products.length};
  }catch(error){
    // Fixed operational message; never persist remote response bodies, signed URLs or credential text.
    const message=error.status?'Fuente rechazada por validación, permisos o contrato.':'No fue posible descargar/aplicar la fuente; revisa conexión y formato.';
    await tx(async db=>{
      await db.query(`UPDATE sync_runs SET state='failed',message=$2,finished_at=now() WHERE id=$1`,[run.id,message]);
      await db.query(`UPDATE catalog_sources SET last_run_at=now(),last_error=$2,failures=failures+1,lease_until=NULL,next_run_at=now()+least(360,5*power(2,least(failures,6)))*interval '1 minute' WHERE id=$1`,[source.id,message]);
    });return {failed:true};
  }
}
export async function runDueSources() {
  const source=(await query(`WITH due AS (SELECT s.id FROM catalog_sources s JOIN brands b ON b.id=s.brand_id JOIN organizations o ON o.id=b.organization_id
    WHERE s.enabled AND s.approved AND o.status='approved' AND s.next_run_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now()) ORDER BY s.next_run_at FOR UPDATE OF s SKIP LOCKED LIMIT 1)
    UPDATE catalog_sources SET lease_until=now()+interval '5 minutes' WHERE id IN(SELECT id FROM due) RETURNING *`)).rows[0];
  if(source) await synchronizeSource(source);
}
