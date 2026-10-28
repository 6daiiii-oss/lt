import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('la carga inicial corresponde a la ruta, no desborda y desaparece al llegar los datos',async({page})=>{
  for(const width of [1366,768,390,360]) {
    await page.setViewportSize({width,height:900});
    for(const [path,type] of [['/','home'],['/catalogo','catalog'],['/productos/exh-21','product'],['/marcas','brands'],['/registro?tipo=proveedor','signup']]) {
      let release;const gate=new Promise(resolve=>release=resolve);
      const hold=async route=>{await gate;await route.continue();};
      await page.route('**/api/me',hold);
      try {
        await page.goto(path,{waitUntil:'domcontentloaded'});
        await expect(page.locator(`[data-loading-view="${type}"]`)).toBeVisible();
        await expect(page.locator('#app')).toHaveAttribute('aria-busy','true');
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await expect(page.locator('.boot-loader-orbit')).toHaveCount(0);
        const animation=await page.locator('.skeleton-block').first().evaluate(el=>getComputedStyle(el,'::after').animationName);
        expect(animation).toBe('skeleton-sweep');
        if(path==='/catalogo'&&width===390)await page.screenshot({path:'test-results/carga-catalogo-390.png'});
      } finally {release();}
      await expect(page.locator('.page-skeleton')).toHaveCount(0);
      await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
      await page.unroute('**/api/me',hold);
    }
  }
});

test('la navegación privada muestra gráficos o registros y respeta movimiento reducido',async({page})=>{
  const {sellerA}=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8'));
  await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(sellerA.email);await page.getByLabel('Contraseña',{exact:true}).fill(sellerA.password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
  for(const [path,type] of [['/panel/estadisticas','statistics'],['/panel/productos','records']]) {
    let release;const gate=new Promise(resolve=>release=resolve);
    const hold=async route=>{await gate;await route.continue();};
    await page.route('**/api/me',hold);
    try {
      await page.goto(path,{waitUntil:'domcontentloaded'});
      await expect(page.locator(`[data-loading-view="${type}"]`)).toBeVisible();
      for(const width of [1366,390,360]) {
        await page.setViewportSize({width,height:900});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      }
      await page.emulateMedia({reducedMotion:'reduce'});
      expect(await page.locator('.skeleton-block').first().evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
      if(type==='statistics')await page.screenshot({path:'test-results/carga-estadisticas-360.png'});
    } finally {release();}
    await expect(page.locator('.page-skeleton')).toHaveCount(0);
    await page.unroute('**/api/me',hold);
  }
});
