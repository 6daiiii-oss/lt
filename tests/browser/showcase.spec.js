import {test,expect} from '@playwright/test';
import {showcaseProducts} from '../../public/modules/showcase-data.js';
test('productos reales y ejemplos comparten cuadrícula sin inventar precios o stock',async({page})=>{
 await page.route('**/api/products?**',route=>route.fulfill({json:{products:[{id:'test-real',name:'Producto real de control',wholesale_cents:2300,moq:2,available:7,brand_id:'marca-real',brand_name:'Marca de control',images:[]}],total:1,page:1,pages:1,newDays:30}}));
 await page.goto('/catalogo');
 await expect(page.locator('.catalog-page > .product-grid')).toHaveCount(1);
 await expect(page.locator('.catalog-page > .product-grid > .product-card')).toHaveCount(51);
 await expect(page.locator('.catalog-status')).toContainText('51 productos');
 await expect(page.locator('.showcase-card .price')).toHaveCount(0);
 const real=page.locator('.product-card').filter({has:page.getByRole('heading',{name:'Producto real de control'})});
 await expect(real).toContainText('23.00');await expect(real).toContainText('Compra mínima: 2 unidades');
 await page.goto('/catalogo?sort=price');await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.locator('.showcase-card')).toHaveCount(0);
 await page.goto('/exhibicion/exh-21');await expect(page).toHaveURL(/\/productos\/exh-21$/);
 await expect(page.getByRole('button',{name:'Solo exhibición',exact:true})).toBeDisabled();
});
test('50 ejemplos visibles, imágenes del mismo producto y ninguna acción de compra',async({page})=>{
 await page.goto('/catalogo');await expect(page.locator('.showcase-card')).toHaveCount(50);
 await page.locator('.showcase-card img').evaluateAll(imgs=>imgs.forEach(i=>i.loading='eager'));
 await expect.poll(()=>page.locator('.showcase-card img').evaluateAll(imgs=>imgs.filter(i=>i.complete&&i.naturalWidth===1000&&i.naturalHeight===1000).length)).toBe(50);
 for(const p of showcaseProducts){
  await page.goto('/productos/'+p.id);await expect(page.getByRole('heading',{name:p.name,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Solo exhibición',exact:true})).toBeDisabled();
  await expect(page.locator('[data-form="add-cart"]')).toHaveCount(0);
  await expect(page.locator('[data-photo-main]')).toHaveAttribute('src',p.images[0].url);
  if(p.images.length>1){await page.getByRole('button',{name:'Ver foto 2',exact:true}).click();await expect(page.locator('[data-photo-main]')).toHaveAttribute('src',new URL(p.images[1].url,page.url()).href);}
 }
});
test('exhibición se descubre sin alterar los productos reales y se adapta a móvil',async({page})=>{
 await page.goto('/');await expect(page.locator('.showcase-card')).toHaveCount(8);
 await page.goto('/catalogo');await expect(page.locator('.showcase-card')).toHaveCount(50);
 await expect(page.locator('.catalog-page > .product-grid')).toHaveCount(1);await expect(page.locator('.showcase-section')).toHaveCount(0);
 await page.goto('/exhibicion');await expect(page).toHaveURL(/\/catalogo$/);
 await page.goto('/catalogo?category=tecnologia');await expect(page.locator('.showcase-card')).toHaveCount(16);
 await page.goto('/catalogo?q=labial');await expect(page.locator('.showcase-card')).toHaveCount(1);
 await page.goto('/catalogo?available=true');await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.locator('.showcase-card')).toHaveCount(0);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.goto('/catalogo');await expect(page.locator('.showcase-card')).toHaveCount(50);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:'test-results/exhibicion-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto('/productos/exh-05');await expect(page.getByRole('button',{name:'Solo exhibición',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/exhibicion-mobile.png',fullPage:true});
});
