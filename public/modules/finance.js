import { feeBreakdown } from './fees.js';
import { money, esc, notice, field, check } from './ui.js';
export function feeSummary(f) {
  return `<dl class="summary-dl"><dt>Productos sin IGV</dt><dd>${money(f.products_base_cents)}</dd><dt>IGV de productos incluido</dt><dd>${money(f.products_tax_cents)}</dd><dt>Servicio de Vendo sin IGV</dt><dd>${money(f.service_cents)}</dd><dt>IGV del servicio</dt><dd>${money(f.service_tax_cents)}</dd><dt>Comisión Vendo · ${f.basis_points/100}% (IGV incluido)</dt><dd>${money(f.service_total_cents)}</dd><dt>Procesamiento de pago${f.processing_payer==='buyer'?' · comprador':''}</dt><dd>${f.processing_quoted===false?'Por cotizar':money(f.processing_estimate_cents)}</dd>${f.buyer_total_estimate_cents!==undefined?`<dt>Total estimado del comprador</dt><dd>${money(f.buyer_total_estimate_cents)}</dd>`:''}<dt>Neto estimado del proveedor</dt><dd>${money(f.seller_estimate_cents)}</dd></dl><p class="small muted">${esc(f.processing_assumption)}. Estimación, no un cargo ni factura. ${esc(f.tax_assumption)}. No incluye devoluciones ni costos de mercadería. En el modelo actual el procesamiento no se descuenta al proveedor. No se cobra hasta contar con una tarifa contratada y aceptación del comprador.</p>`;
}
export function simulator() {
  return `<section class="card"><h2>Comisión de Vendo</h2><p>Vendo cobra el 7% del valor de los productos. Introduce su precio final; el envío no genera comisión.</p>${field('simulation_products','Total de productos (S/)','number','1000','min="0.01" max="1000000" step="0.01"')}<div id="fee-simulation" aria-live="polite"></div><p class="small muted">Cálculo orientativo. No se realiza ningún cobro.</p></section>`;
}
export function bindSimulator() {
  const products=document.querySelector('[name=simulation_products]');
  const draw=()=>{const output=document.querySelector('#fee-simulation');try{if(!/^\d+(?:\.\d{1,2})?$/.test(products.value))throw Error();const amount=Math.round(Number(products.value)*100);if(amount<1)throw Error();const fees=feeBreakdown(amount);output.innerHTML=`<dl class="summary-dl"><dt>Comisión Vendo · ${fees.basis_points/100}%</dt><dd>${money(fees.service_total_cents)}</dd></dl>`;}catch{output.innerHTML=notice('Escribe un importe mayor que cero con hasta dos decimales.','warning');}};
  products.addEventListener('input',draw);draw();
}
