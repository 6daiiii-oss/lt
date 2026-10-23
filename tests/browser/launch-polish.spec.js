import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('registro, términos y privacidad se adaptan desde 320px y no aceptan condiciones por defecto',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,360,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  for(const path of ['/registro?tipo=proveedor','/terminos','/privacidad']){
   await page.goto(path);await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(path.startsWith('/registro')){await expect(page.locator('[name=terms_accepted]')).not.toBeChecked();await expect(page.locator('[name=terms_accepted]')).toHaveAttribute('required','');}
  }
 }
 expect(errors).toEqual([]);await page.screenshot({path:'test-results/privacidad-1440.png',fullPage:true});
});
test('menú móvil compacto, exportación privada y simulación split de administración',async({page})=>{
 const accounts=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8'));
 await page.setViewportSize({width:390,height:900});await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(accounts.admin.email);await page.getByLabel('Contraseña',{exact:true}).fill(accounts.admin.password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/administracion/);
 await expect(page.locator('.panel-navigation')).not.toHaveAttribute('open','');await page.getByText('Menú de mi panel',{exact:true}).click();await expect(page.getByRole('link',{name:'Configuración',exact:true})).toBeVisible();
 await page.goto('/administracion/finanzas');await page.getByRole('button',{name:'Añadir otro proveedor',exact:true}).click();await page.getByRole('button',{name:'Calcular reparto',exact:true}).click();await expect(page.locator('#split-result')).toContainText('Total del comprador');await expect(page.locator('#split-result')).toContainText('ejecución está bloqueada');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto('/cuenta/seguridad');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar mis datos',exact:true}).click();const download=await pending;expect(download.suggestedFilename()).toBe('vendo-mis-datos.json');
});
