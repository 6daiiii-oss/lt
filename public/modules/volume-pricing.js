// All payable amounts use integer PEN cents. Unit equivalents are display references only.
const max=100_000_000;
const integer=(n,min=1,limit=1_000_000)=>Number.isSafeInteger(n)&&n>=min&&n<=limit;
export function validatePresentations(items){
 if(!Array.isArray(items)||items.length>8)throw Error('Configura hasta 8 presentaciones.');
 const keys=new Set();
 for(const p of items){
  if(typeof p.key!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(p.key)||['__proto__','constructor','prototype'].includes(p.key)||keys.has(p.key))throw Error('Cada presentación necesita un identificador distinto.');keys.add(p.key);
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw Error('Indica el nombre de cada presentación.');
  for(const k of ['units_per_pack','min_packs','pack_step'])if(!integer(p[k]))throw Error('Contenido, mínimo e incremento deben ser números enteros positivos.');
  if(!integer(p.price_cents,1,max))throw Error('Indica un precio válido por presentación.');
  if(!['shared','separate'].includes(p.stock_mode))throw Error('Selecciona inventario compartido o separado.');
  if(p.stock!==undefined&&!integer(p.stock,0))throw Error('El stock de cajas debe ser un entero no negativo.');
  if(typeof p.allow_assortment!=='boolean'||typeof p.assortment!=='string'||p.assortment.length>500)throw Error('Revisa las condiciones del surtido.');
  if(p.quote_from!==null&&p.quote_from!==undefined&&!integer(p.quote_from))throw Error('Indica desde cuántas presentaciones aceptas cotizaciones.');
  if(!Array.isArray(p.tiers)||p.tiers.length>3)throw Error('Añade hasta tres tramos por presentación.');
  presentationPrice(p,p.min_packs);
  let lastQuantity=p.min_packs,lastPrice=p.price_cents;
  for(const t of p.tiers){
   if(!integer(t.from)||t.from<=lastQuantity||(t.from-p.min_packs)%p.pack_step!==0)throw Error('Los tramos deben aumentar y respetar el mínimo y el incremento.');
   if(!integer(t.price_cents,1,max)||t.price_cents>lastPrice)throw Error('El precio por volumen no puede aumentar al comprar más.');
   lastQuantity=t.from;lastPrice=t.price_cents;
  }
 }
 return items;
}
export function presentationPrice(p,count){
 if(!integer(count)||count<p.min_packs||(count-p.min_packs)%p.pack_step!==0)throw Error(`Compra desde ${p.min_packs} ${p.name}, con incrementos de ${p.pack_step}.`);
 let price=p.price_cents,from=p.min_packs;for(const t of p.tiers)if(count>=t.from){price=t.price_cents;from=t.from;}
 const units=count*p.units_per_pack,total=count*price;
 if(!integer(units)||!integer(total,1,max))throw Error('La cantidad o el importe supera el límite del pedido.');
 return {pack_quantity:count,units,pack_price_cents:price,line_total_cents:total,unit_equivalent_cents:price/p.units_per_pack,tier_from:from};
}
export function priceProduct(p,{presentation_key='',pack_quantity,quantity}={}){
 if(p.presentations?.length){const presentation=p.presentations.find(x=>x.key===presentation_key);if(!presentation)throw Error('Selecciona una presentación disponible.');return {...presentationPrice(presentation,pack_quantity),presentation_key:presentation.key,presentation_name:presentation.name,units_per_pack:presentation.units_per_pack,inventory_key:presentation.stock_mode==='separate'?presentation.key:'',presentation};}
 const n=quantity??pack_quantity;
 if(!integer(n)||n<p.moq||n%p.pack_multiple!==0)throw Error('Revisa el mínimo y los múltiplos de unidades de este producto.');
 const total=n*p.wholesale_cents;if(!integer(total,1,max))throw Error('Importe fuera de límite.');
 return {presentation_key:'',presentation_name:'Unidad',units_per_pack:1,pack_quantity:n,units:n,pack_price_cents:p.wholesale_cents,line_total_cents:total,unit_equivalent_cents:p.wholesale_cents,inventory_key:'',presentation:null};
}
