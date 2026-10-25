import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salesBuckets,catalogCounts,catalogChart,productBars} from '../public/modules/charts.js';
test('el gráfico completa días sin ventas y conserva céntimos y pedidos al agrupar períodos largos',()=>{
 const daily=[{date:'2026-01-02',gross_products_cents:12345,orders:2},{date:'2026-01-04',gross_products_cents:1,orders:1},{date:'2027-01-01',gross_products_cents:999,orders:1}];
 const short=salesBuckets(daily,'2026-01-01','2026-01-04');assert.equal(short.length,4);assert.equal(short[0].gross_products_cents,0);assert.equal(short[2].orders,0);assert.equal(short.reduce((n,b)=>n+b.gross_products_cents,0),12346);
 const long=salesBuckets(daily,'2026-01-01','2026-12-31');assert.ok(long.length<=30);assert.equal(long[0].from,'2026-01-01');assert.equal(long.at(-1).to,'2026-12-31');assert.equal(long.reduce((n,b)=>n+b.gross_products_cents,0),12346);assert.equal(long.reduce((n,b)=>n+b.orders,0),3);
 assert.ok(salesBuckets([],'0001-01-01','9999-12-31').length<=30);assert.throws(()=>salesBuckets([],'2026-02-02','2026-01-01'));
});
test('el resumen de catálogo excluye archivados y alerta según disponibilidad real y mínimo',()=>{
 const counts=catalogCounts([{status:'published',available:10,moq:10},{status:'pending',available:3,moq:6},{status:'draft',available:0,moq:1},{status:'archived',available:100,moq:1}]);assert.equal(counts.active,3);assert.equal(counts.published,1);assert.equal(counts.pending,1);assert.equal(counts.other,1);assert.equal(counts.available,13);assert.equal(counts.out.length,2);
});
test('los gráficos vacíos no inventan actividad y los nombres de productos se escapan',()=>{
 assert.match(catalogChart(catalogCounts([])),/primer producto/);assert.doesNotMatch(catalogChart(catalogCounts([])),/<svg/);
 const html=productBars([{name:'<img onerror="alert(1)">',gross_cents:100,units:1}]);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/role="img"/);
});
