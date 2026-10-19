import { api } from './api.js';
import { arrow, esc } from './ui.js';
import { navigate } from './router.js';

export const searchIcon='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
let active=[];
let categoryRequest;
const publicCategories=()=>categoryRequest??=api('/categories').catch(error=>{categoryRequest=null;throw error;});
export function disposeSearch(){for(const cleanup of active)cleanup();active=[];}
export function searchBox(name,value='',placeholder='Busca productos, categorías o marcas',label='Buscar productos y marcas') {
  return `<div class="search-widget"><form class="discovery-search" data-form="${name}" role="search" autocomplete="off">${searchIcon}<label class="sr-only" for="${name}-q">${esc(label)}</label><input id="${name}-q" name="q" type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="100" aria-controls="${name}-suggestions" aria-expanded="false"><button type="submit">Buscar</button></form><div id="${name}-suggestions" class="search-suggestions" hidden></div></div>`;
}
export function bindSearch(name,{categories=[],params=new URLSearchParams(),destination='/catalogo'}={}) {
  const form=document.querySelector(`[data-form="${name}"]`);if(!form)return;
  const input=form.elements.q,panel=document.getElementById(`${name}-suggestions`),controller=new AbortController();
  let timer,request=0;
  const listen=(target,event,fn)=>target.addEventListener(event,fn,{signal:controller.signal});
  const close=()=>{clearTimeout(timer);++request;panel.hidden=true;input.setAttribute('aria-expanded','false');};
  const show=html=>{panel.innerHTML=html;panel.hidden=false;input.setAttribute('aria-expanded','true');};
  const target=q=>{const p=new URLSearchParams(params);p.delete('page');q.trim()?p.set('q',q.trim()):p.delete('q');return destination+(p.size?'?'+p:'');};
  const suggest=async()=>{
    const q=input.value.trim(),version=++request;if(q.length<2){close();return;}
    try {
      const [listing,brands,availableCategories]=await Promise.all([destination==='/marcas'?Promise.resolve({products:[]}):api('/products?limit=4&q='+encodeURIComponent(q)),api('/brands?q='+encodeURIComponent(q)),destination==='/marcas'?Promise.resolve([]):categories.length?Promise.resolve(categories):publicCategories()]);
      if(version!==request||!form.isConnected)return;
      const matches=availableCategories.filter(c=>c.name.toLocaleLowerCase('es').includes(q.toLocaleLowerCase('es'))).slice(0,3);
      const rows=[...matches.map(c=>`<a href="/catalogo?category=${encodeURIComponent(c.id)}"><span class="suggestion-symbol">${arrow}</span><span>${esc(c.name)}<small>Categoría</small></span></a>`),...listing.products.map(p=>`<a href="/productos/${encodeURIComponent(p.id)}"><span class="suggestion-symbol">${searchIcon}</span><span>${esc(p.name)}<small>${esc(p.brand_name)} · Producto</small></span></a>`),...brands.slice(0,2).map(b=>`<a href="/marcas/${encodeURIComponent(b.id)}"><span class="suggestion-symbol">${esc(b.name.slice(0,1))}</span><span>${esc(b.name)}<small>Marca</small></span></a>`)];
      show(`<p class="suggestions-heading">${rows.length?'Sugerencias':destination==='/marcas'?'Prueba con otro nombre de marca':'Prueba otra palabra o explora una categoría'}</p>${rows.join('')}<a class="suggestion-all" href="${esc(target(q))}">Buscar “${esc(q)}” ${destination==='/marcas'?'en marcas':'en el catálogo'} <span aria-hidden="true">→</span></a>`);
    }catch{if(version===request)close();}
  };
  listen(form,'submit',event=>{event.preventDefault();navigate(target(input.value));});
  listen(input,'input',()=>{clearTimeout(timer);++request;if(input.value.trim().length<2)close();else timer=setTimeout(suggest,280);});
  listen(input,'focus',()=>{if(input.value.trim().length>=2){clearTimeout(timer);timer=setTimeout(suggest,120);}});
  listen(form.parentElement,'keydown',event=>{
    if(event.key==='Escape'){close();input.focus();}
    if(event.key==='ArrowDown'&&event.target===input&&!panel.hidden){event.preventDefault();panel.querySelector('a')?.focus();}
  });
  listen(document,'click',event=>{if(!form.parentElement.contains(event.target))close();});
  listen(form.parentElement,'focusout',event=>{if(!form.parentElement.contains(event.relatedTarget))close();});
  active.push(()=>{clearTimeout(timer);++request;controller.abort();});
}
