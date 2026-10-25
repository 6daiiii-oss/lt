import {test,expect} from '@playwright/test';
import {showcaseProducts} from '../../public/modules/showcase-data.js';
test('20 ejemplos visibles, imágenes del mismo producto y ninguna acción de compra',async({page})=>{
 await page.goto('/exhibicion');await expect(page.locator('.showcase-card')).toHaveCount(20);
 await page.locator('.showcase-card img').evaluateAll(imgs=>imgs.forEach(i=>i.loading='eager'));
 await expect.poll(()=>page.locator('.showcase-card img').evaluateAll(imgs=>imgs.filter(i=>i.complete&&i.naturalWidth===1000&&i.naturalHeight===1000).length)).toBe(20);
 for(const p of showcaseProducts){
  await page.goto('/exhibicion/'+p.id);await expect(page.getByRole('heading',{name:p.name,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Solo exhibición',exact:true})).toBeDisabled();
  await expect(page.locator('[data-form="add-cart"]')).toHaveCount(0);
  await expect(page.locator('[data-photo-main]')).toHaveAttribute('src',p.images[0].url);
  if(p.images.length>1){await page.getByRole('button',{name:'Ver foto 2',exact:true}).click();await expect(page.locator('[data-photo-main]')).toHaveAttribute('src',new URL(p.images[1].url,page.url()).href);}
 }
});
test('exhibición se descubre sin alterar los productos reales y se adapta a móvil',async({page})=>{
 await page.goto('/');await expect(page.locator('.showcase-card')).toHaveCount(6);
 await page.goto('/catalogo');await expect(page.locator('.showcase-card')).toHaveCount(20);
 await page.goto('/catalogo?q=labial');await expect(page.locator('.showcase-card')).toHaveCount(1);
 await page.goto('/catalogo?available=true');await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.locator('.showcase-card')).toHaveCount(0);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.goto('/exhibicion');await expect(page.locator('.showcase-card')).toHaveCount(20);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:'test-results/exhibicion-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto('/exhibicion/exh-05');await expect(page.getByRole('button',{name:'Solo exhibición',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/exhibicion-mobile.png',fullPage:true});
});
