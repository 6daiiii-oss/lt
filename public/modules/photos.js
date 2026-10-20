import { esc } from './ui.js';
export function photoGallery(images=[],key='product') {
  images=images||[];
  if(!images.length)return '<div class="photo-empty">Todavía no hay fotos.</div>';
  return `<div class="photo-gallery" data-gallery="${esc(key)}"><img class="photo-main" src="${esc(images[0].url)}" alt="${esc(images[0].alt||'Foto del producto')}" data-photo-main><div class="photo-thumbs" aria-label="Fotos del producto">${images.map((im,i)=>`<button type="button" data-photo-index="${i}" aria-label="Ver foto ${i+1}" aria-pressed="${i===0}"><img src="${esc(im.url)}" alt="${esc(im.alt||'Foto '+(i+1))}" loading="lazy"></button>`).join('')}</div><p class="small muted" data-photo-count>Foto 1 de ${images.length}</p></div>`;
}
export function bindPhotoGalleries() {
  document.querySelectorAll('[data-gallery]').forEach(gallery=>{
    const buttons=[...gallery.querySelectorAll('[data-photo-index]')];
    const main=gallery.querySelector('[data-photo-main]');
    main.addEventListener('error',()=>{main.alt='Esta foto no se pudo cargar. Puedes elegir otra.';});
    buttons.forEach((button,i)=>button.addEventListener('click',()=>{
      const thumb=button.querySelector('img'),main=gallery.querySelector('[data-photo-main]');
      if(!main||!thumb)return;
      main.src=thumb.src;main.alt=thumb.alt;
      buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      gallery.querySelector('[data-photo-count]').textContent=`Foto ${i+1} de ${buttons.length}`;
    }));
  });
}
