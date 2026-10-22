// Productos de muestra: solo para visualización. Nunca se insertan en PostgreSQL,
// nunca se consideran inventario real y sus IDs no son UUID válidos para comprar.
import { demoProducts, demoBrand } from '../scripts/pages-demo-catalog.mjs';

export function exampleProduct(productId) {
  return demoProducts.find(product => product.id === productId) || null;
}
export function exampleBrand(brandId) {
  return brandId === demoBrand.id ? { ...demoBrand, commercial_status:'demo' } : null;
}
const norm = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export function exampleProducts(filters = {}) {
  // Nunca fingimos compras, stock, novedades o márgenes comerciales verificables.
  if (filters.available === 'true' ||
      filters.selection === 'new' ||
      filters.selection === 'margin' ||
      filters.min_margin !== undefined ||
      (filters.brand && filters.brand !== demoBrand.id)) return [];

  let list = demoProducts.filter(p => {
    if (filters.category && filters.category !== p.category_id) return false;
    if (filters.min_price !== undefined && p.wholesale_cents < filters.min_price) return false;
    if (filters.max_price !== undefined && p.wholesale_cents > filters.max_price) return false;
    if (filters.max_moq !== undefined && p.moq > filters.max_moq) return false;
    if (filters.max_brand_min !== undefined && p.min_order_cents > filters.max_brand_min) return false;
    if (filters.selection === 'small' && p.moq > 12) return false;
    if (filters.q && !norm(p.name + ' ' + p.description + ' ' + p.sku)
      .includes(norm(filters.q).trim())) return false;
    return true;
  });
  list = [...list];
  switch (filters.sort) {
    case 'price': list.sort((a,b) => a.wholesale_cents - b.wholesale_cents); break;
    case 'price-desc': list.sort((a,b) => b.wholesale_cents - a.wholesale_cents); break;
    case 'moq': list.sort((a,b) => a.moq - b.moq); break;
    case 'margin': list.sort((a,b) => b.margin_percent - a.margin_percent); break;
    default: break;
  }
  return list;
}
export function exampleBrandList(q='') {
  return norm(demoBrand.name).includes(norm(q)) ? [{...demoBrand,commercial_status:'demo'}] : [];
}
