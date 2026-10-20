import { feeBreakdown } from './fees.js';
import { money, esc, notice, field, check } from './ui.js';
export function feeSummary(f) {
  return `<dl class="summary-dl"><dt>Productos sin IGV</dt><dd>${money(f.products_base_cents)}</dd><dt>IGV de productos incluido</dt><dd>${money(f.products_tax_cents)}</dd><dt>Servicio Lote · ${f.basis_points/100}%</dt><dd>${money(f.service_cents)}</dd><dt>IGV del servicio</dt><dd>${money(f.service_tax_cents)}</dd><dt>Total comisión Lote</dt><dd>${money(f.service_total_cents)}</dd><dt>Procesamiento estimado</dt><dd>${money(f.processing_estimate_cents)}</dd><dt>Neto estimado del proveedor</dt><dd>${money(f.seller_estimate_cents)}</dd></dl><p class="small muted">${esc(f.processing_assumption)}. Estimación, no un cargo ni factura. ${esc(f.tax_assumption)}. No incluye devoluciones ni costos de mercadería. En sandbox no se descuenta procesamiento de la liquidación.</p>`;
}
export function simulator() {
  return `<section class="card"><h2>Simula un pedido</h2><p>Precio de productos con IGV. El comprador no paga un recargo de Lote.</p><div class="form-grid">${field('simulation_products','Productos con IGV (S/)','number','1000','min="0.01" max="1000000" step="0.01"')}${field('simulation_shipping','Envío (S/)','number','0','min="0" max="1000000" step="0.01"')}<div class="full">${check('simulation_repeat','Recompra de la misma tienda a la misma marca',false)}</div></div><div id="fee-simulation" aria-live="polite"></div></section>`;
}
export function bindSimulator() {
  const products=document.querySelector('[name=simulation_products]'),shipping=document.querySelector('[name=simulation_shipping]'),repeat=document.querySelector('[name=simulation_repeat]');
  const draw=()=>{const output=document.querySelector('#fee-simulation');try{const amounts=[products.value,shipping.value].map(v=>{if(!/^\d+(?:\.\d{1,2})?$/.test(v))throw Error();return Math.round(Number(v)*100);});output.innerHTML=feeSummary(feeBreakdown(...amounts,repeat.checked));}catch{output.innerHTML=notice('Escribe importes válidos con hasta dos decimales.','warning');}};
  [products,shipping,repeat].forEach(el=>el.addEventListener('input',draw));draw();
}
