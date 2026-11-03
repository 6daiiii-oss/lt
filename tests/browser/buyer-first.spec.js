import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';import sharp from 'sharp';
test('inicio centrado en comprar, seis categorías surtidas y ayuda por WhatsApp',async({page})=>{
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/');
  await expect(page.locator('.market-nav a')).toHaveText(['Productos','Cómo comprar']);await expect(page.locator('.market-hero a[href="/proveedores"]')).toHaveCount(0);
  await expect(page.locator('.showcase-card')).toHaveCount(16);await expect(page.locator('.category-card')).toHaveCount(6);await expect(page.locator('.footer a[href="/proveedores"]')).toBeVisible();
  await expect(page.getByRole('link',{name:'Soporte de Vendo por WhatsApp, 977 979 462'})).toHaveAttribute('href',/^https:\/\/wa.me\/51977979462/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/inicio-comprar-${width}.png`,fullPage:true});
 }
 for(const [category,name] of [['regalos','Cuadernos de colores'],['juguetes','Cubo de colores para armar']]){await page.goto('/catalogo?category='+category);await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();}
 await page.goto('/marcas');await expect(page).toHaveURL(/\/catalogo$/);
});
test('proveedor añade foto, banner y descripción después del registro y los conserva',async({page})=>{
 const a=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8')).sellerA;await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(a.email);await page.getByLabel('Contraseña',{exact:true}).fill(a.password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
 await page.goto('/panel/negocio');await page.getByRole('link',{name:'Personalizar mi perfil',exact:true}).click();
 const buffer=await sharp({create:{width:40,height:20,channels:3,background:'#c17c5a'}}).png().toBuffer();
 for(const kind of ['avatar','banner']){await page.locator(`[data-profile-image=${kind}]`).setInputFiles({name:kind+'.png',mimeType:'image/png',buffer});await expect(page.locator('#profile-upload-status')).toContainText('Imagen lista.');}
 await page.getByRole('textbox',{name:'Descripción de tu negocio',exact:true}).fill('Surtido de prueba para tiendas.');await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();await expect(page.locator('#toast')).toHaveText('Perfil guardado.');await page.reload();
 await expect(page.locator('#supplier-avatar img')).toBeVisible();await expect(page.locator('#supplier-cover img')).toBeVisible();await expect(page.getByRole('textbox',{name:'Descripción de tu negocio',exact:true})).toHaveValue('Surtido de prueba para tiendas.');
 await page.goto('/marcas/'+a.brandId);await expect(page.locator('.supplier-avatar img')).toBeVisible();await expect(page.locator('.supplier-cover img')).toBeVisible();await expect(page.getByText('Surtido de prueba para tiendas.',{exact:true})).toBeVisible();
});
