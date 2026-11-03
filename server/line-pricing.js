import {priceProduct} from '../public/modules/volume-pricing.js';
import {requireThat} from './lib.js';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
export const destinationMatches=(destination,address)=>normalize(destination.region)===normalize(address.region)&&normalize(destination.district)===normalize(address.district)&&(!destination.address||normalize(destination.address)===normalize(address.line1));
export const presentationContract=(p,pricing)=>JSON.stringify({key:pricing.presentation_key,units:pricing.units_per_pack,inventory:pricing.inventory_key,variant:p.variant,assortment:pricing.presentation?.assortment||'',allow_assortment:pricing.presentation?.allow_assortment||false});
export async function resolveLine(db,p,input,buyerId,{checkoutId=null}={}){
 let pricing;try{pricing=priceProduct(p,input);}catch(e){requireThat(false,e.message,422,'presentation_conditions');}
 requireThat(!input.assortment_note||pricing.presentation?.allow_assortment,'Esta presentación no admite surtido personalizado.',422);
 if(!input.offer_id)return pricing;
 const q=(await db.query('SELECT * FROM special_quotes WHERE id=$1 AND buyer_id=$2',[input.offer_id,buyerId])).rows[0];
 requireThat(q&&q.status==='accepted'&&new Date(q.expires_at)>new Date(),'La cotización no está aceptada o ya venció.',409,'offer_expired');
 if(q.checkout_id&&q.checkout_id!==checkoutId){const c=(await db.query('SELECT state FROM checkouts WHERE id=$1',[q.checkout_id])).rows[0];requireThat(c&&['failed','expired'].includes(c.state),'La cotización ya está vinculada a otro pedido.',409);}
 requireThat(q.offer.delivery_date>=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),'La fecha de entrega acordada pasó. Solicita una nueva oferta.',409);
 const item=q.offer.items.find(x=>x.product_id===p.id&&x.presentation_key===pricing.presentation_key&&x.pack_quantity===pricing.pack_quantity);
 requireThat(item&&item.contract===presentationContract(p,pricing),'El producto o la presentación cambió. Solicita actualizar la cotización.',409);
 return {...pricing,pack_price_cents:item.pack_price_cents,line_total_cents:item.line_total_cents,unit_equivalent_cents:item.pack_price_cents/pricing.units_per_pack,offer_destination:q.destination,offer_id:q.id,offer_shipping_cents:q.offer.shipping_cents,offer_delivery_date:q.offer.delivery_date,offer_expires_at:q.expires_at,offer_item_count:q.offer.items.length};
}
