import {showcaseProducts} from './showcase-data.js';
import {esc,button,notice,cards} from './ui.js';
import {photoGallery} from './photos.js';
const categoryNames={hogar:'Hogar y cocina',belleza:'Belleza y cuidado',moda:'Moda y accesorios',tecnologia:'Tecnología'};
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
export function findShowcase(params=new URLSearchParams()){
 // Offers-only filters cannot imply a price, stock, minimum or supplier for an example.
 if(['brand','min_price','max_price','max_moq','max_brand_min','min_margin','available','selection'].some(key=>params.has(key)&&params.get(key)!==''))return [];
 if(['price','price-desc','margin','moq'].includes(params.get('sort')))return [];
 const terms=normalize(params.get('q')||'').trim().split(/\s+/).filter(Boolean),category=params.get('category');
 return showcaseProducts.filter(p=>(!category||p.category_id===category)&&terms.every(t=>normalize(p.name+' '+p.description+' '+categoryNames[p.category_id]).includes(t)));
}
export const showcaseCards=cards;
export function showcaseView(path,url){
 const id=path.match(/^\/productos\/(exh-[^/]+)$/)?.[1];if(!id)return null;const p=showcaseProducts.find(p=>p.id===id);
 if(!p)return {html:`<section class="container page"><h1>Ficha de exhibición no encontrada</h1>${button('Volver al catálogo','/catalogo')}</section>`};
 const related=showcaseProducts.filter(x=>x.category_id===p.category_id&&x.id!==p.id).slice(0,4);
 return {html:`<section class="container page showcase-detail"><div class="breadcrumbs"><a href="/catalogo">Productos</a><span>/</span>${esc(p.name)}</div>${notice('Producto de exhibición. Es una ficha demostrativa, sin precio, stock ni proveedor real. No se puede comprar.')}<div class="detail-grid"><div class="gallery">${photoGallery(p.images,'showcase-'+p.id)}</div><div class="detail-info"><p class="eyebrow">${esc(categoryNames[p.category_id])}</p><span class="badge">Exhibición</span><h1>${esc(p.name)}</h1><p>${esc(p.description)}</p><button class="button" type="button" disabled>Solo exhibición</button><p class="small muted">Las imágenes son ilustrativas de un catálogo de prueba. Vendo no ofrece este producto ni representa a las marcas que puedan aparecer en ellas.</p><div class="actions">${button('Seguir explorando','/catalogo',true)}${button('Crear el catálogo de mi marca','/registro?tipo=proveedor',true)}</div><details class="section"><summary>Sobre estas imágenes</summary><p class="small">Imágenes del producto de ejemplo ${p.source_id} de <a class="link-under" href="https://dummyjson.com/docs/products" target="_blank" rel="noopener">DummyJSON</a>. Las vistas de esta ficha corresponden al mismo producto de origen.</p></details></div></div>${related.length?`<section class="section"><h2>Más ideas de exhibición</h2>${showcaseCards(related)}</section>`:''}</section>`};
}
