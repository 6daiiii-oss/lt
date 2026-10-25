import {esc,money} from './ui.js';
export const chartDate=date=>String(date).split('-').reverse().join('/');
const dayMs=86400000;
const dateMs=date=>Date.parse(date+'T00:00:00Z');
const iso=ms=>new Date(ms).toISOString().slice(0,10);
export function salesBuckets(daily,from,to){
 const start=dateMs(from),end=dateMs(to),count=Math.round((end-start)/dayMs)+1;
 if(!Number.isFinite(count)||count<1)throw new RangeError('Revisa las fechas del gráfico.');
 const step=Math.max(1,Math.ceil(count/30)),buckets=Array.from({length:Math.ceil(count/step)},(_,i)=>({from:iso(start+i*step*dayMs),to:iso(Math.min(end,start+((i+1)*step-1)*dayMs)),gross_products_cents:0,orders:0}));
 for(const d of daily||[]){const offset=Math.round((dateMs(d.date)-start)/dayMs);if(offset<0||offset>=count||!Number.isFinite(offset))continue;const b=buckets[Math.floor(offset/step)];b.gross_products_cents+=Number(d.gross_products_cents);b.orders+=Number(d.orders);}
 return buckets;
}
export function catalogCounts(products){const active=products.filter(p=>p.status!=='archived');return {active:active.length,published:active.filter(p=>p.status==='published').length,pending:active.filter(p=>p.status==='pending').length,other:active.filter(p=>!['published','pending'].includes(p.status)).length,available:active.reduce((n,p)=>n+Number(p.available||0),0),out:active.filter(p=>Number(p.available)<Number(p.moq))};}
export function catalogChart(counts){
 if(!counts.active)return '<p class="muted chart-empty">Añade tu primer producto para ver cómo avanza tu catálogo.</p>';
 const segments=[['Publicados',counts.published,'published'],['En revisión',counts.pending,'pending'],['Por completar o revisar',counts.other,'other']],circumference=2*Math.PI*58;let offset=0;
 return `<div class="catalog-chart"><svg viewBox="0 0 160 160" role="img" aria-label="Estado de ${counts.active} productos: ${counts.published} publicados, ${counts.pending} en revisión y ${counts.other} por completar o revisar"><circle cx="80" cy="80" r="58" class="donut-track"/>${segments.filter(([,n])=>n).map(([label,n,kind])=>{const length=n/counts.active*circumference,svg=`<circle cx="80" cy="80" r="58" class="donut-segment ${kind}" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}"><title>${esc(label)}: ${n}</title></circle>`;offset+=length;return svg;}).join('')}<text x="80" y="79" text-anchor="middle" class="donut-total">${counts.active}</text><text x="80" y="101" text-anchor="middle" class="donut-caption">productos</text></svg><ul class="chart-legend">${segments.map(([label,n,kind])=>`<li><span class="chart-dot ${kind}" aria-hidden="true"></span><span>${esc(label)}</span><strong>${n}</strong></li>`).join('')}</ul></div>`;
}
export function salesChart(buckets){
 const max=Math.max(1,...buckets.map(b=>b.gross_products_cents)),width=600,height=160;
 const points=buckets.map((b,i)=>[30+(buckets.length===1?(width-60)/2:i*(width-60)/(buckets.length-1)),height-15-b.gross_products_cents/max*(height-40)]);
 return `<figure class="sales-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Ventas de productos del ${chartDate(buckets[0].from)} al ${chartDate(buckets.at(-1).to)}. Máximo del gráfico ${esc(money(max))}. Importes antes de devoluciones y sin envío."><line x1="30" y1="${height-15}" x2="570" y2="${height-15}" class="chart-axis"/><polyline points="${points.map(p=>p.join(',')).join(' ')}" class="sales-line"/>${points.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="4" class="sales-point"><title>${buckets[i].from}${buckets[i].to!==buckets[i].from?' al '+buckets[i].to:''}: ${esc(money(buckets[i].gross_products_cents))} · ${buckets[i].orders} pedidos</title></circle>`).join('')}</svg><figcaption><span>${buckets[0].from}</span><span>Hasta ${money(max)}</span><span>${buckets.at(-1).to}</span></figcaption></figure>`;
}
export function productBars(products){const top=[...products].sort((a,b)=>Number(b.gross_cents)-Number(a.gross_cents)).slice(0,5),max=Math.max(1,...top.map(p=>Number(p.gross_cents)));return `<ol class="product-ranking">${top.map(p=>`<li><div><span>${esc(p.name)}</span><strong>${money(p.gross_cents)}</strong></div><svg viewBox="0 0 100 5" preserveAspectRatio="none" role="img" aria-label="${esc(p.name)}: ${p.units} unidades, ${esc(money(p.gross_cents))} en ventas de productos"><rect width="100" height="5" class="bar-track"/><rect width="${Math.max(0,Number(p.gross_cents))/max*100}" height="5" rx="2" class="bar-value"/></svg><span class="small muted">${p.units} unidades</span></li>`).join('')}</ol>`;}
