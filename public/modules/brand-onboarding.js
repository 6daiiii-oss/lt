import { esc } from './ui.js';
export function brandSteps(current=1) {
 const steps=['Tu marca','Tu celular','Tu catálogo'];
 return `<ol class="brand-steps" aria-label="Pasos para registrar tu marca">${steps.map((label,i)=>`<li ${i+1===current?'aria-current="step"':''} class="${i+1<current?'complete':''}"><span aria-hidden="true">${i+1<current?'✓':i+1}</span><b>${label}</b></li>`).join('')}</ol>`;
}
export function brandJourney({step=1,title,copy,body}) {
 return `<section class="brand-enrollment"><aside class="brand-story"><div class="brand-story-copy"><p class="eyebrow">Para marcas y proveedores · Perú</p><h2>Tu marca.<br> Su próxima tienda.</h2><p>Prepara tu catálogo mayorista y presenta tus productos a tiendas que buscan nuevas marcas.</p><ul class="brand-benefits"><li>Define tus precios y mínimos de unidades.</li><li>Añade productos a tu ritmo.</li><li>Recibe una revisión antes de publicar.</li></ul></div><div class="brand-story-image"><img src="/images/store-1200.webp" width="1200" height="800" alt="" loading="eager"><p>Un espacio para mostrar lo que haces.</p></div></aside>
 <div class="brand-form-panel">${brandSteps(step)}<div class="brand-form-heading"><p class="eyebrow">Paso ${step} de 3</p><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>${body}</div></section>`;
}
