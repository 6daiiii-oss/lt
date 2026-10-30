import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
const widths=[1440,1024,768,390,360];
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
async function login(page,account){await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(account.email);await page.getByLabel('Contraseña',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
test('portada y catálogo vacío responsive, filtros compartibles, historial, etiquetas, foco y error',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of widths){await page.setViewportSize({width,height:1000});await page.goto('/');await expect(page.getByRole('heading',{name:/Todo lo que tu tienda necesita/})).toBeVisible();await noOverflow(page);await page.goto('/catalogo');await expect(page.locator('.catalog-page > .product-grid .showcase-card')).toHaveCount(50);await noOverflow(page);await page.screenshot({path:`test-results/catalogo-vacio-${width}.png`,fullPage:true});}
  await page.getByRole('searchbox',{name:'Buscar productos y marcas',exact:true}).fill('consulta sin resultados');await page.getByRole('searchbox',{name:'Buscar productos y marcas',exact:true}).press('Enter');await expect(page).toHaveURL(/q=consulta/);await expect(page.getByRole('heading',{name:'No encontramos productos'})).toBeVisible();
  await page.goBack();await expect(page.getByRole('searchbox',{name:'Buscar productos y marcas',exact:true})).toHaveValue('');
  const unlabelled=await page.locator('input,select,textarea').evaluateAll(inputs=>inputs.filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')).length);expect(unlabelled).toBe(0);
  await page.getByRole('link',{name:'Saltar al contenido'}).focus();await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
  await page.route('**/api/products?**',route=>route.abort());await page.goto('/catalogo?q=fallo');await expect(page.getByRole('heading',{name:'No pudimos completar esta vista.'})).toBeVisible();await noOverflow(page);expect(errors).toEqual([]);
});
test('registro de proveedor: solo número, acceso directo y dos productos sin verificar correo',async({page})=>{
  const email='registro-'+Date.now()+'@example.invalid',password='Registro-seguro-password-2026';
  await page.goto('/registro?tipo=proveedor');
  await page.getByLabel('Tu nombre',{exact:true}).fill('Prueba de registro');
  await page.getByLabel('Nombre de tu negocio').fill('Marca de prueba');
  await page.getByLabel('Tu número de celular',{exact:true}).fill('987654321');
  await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
  await page.getByLabel('Contraseña · mínimo 12 caracteres').fill(password);
  await page.locator('[name=terms_accepted]').check();
  await page.getByRole('button',{name:'Continuar y verificar mi número',exact:true}).click();
  await expect(page).toHaveURL(/\/registro\/celular$/);
  const code=page.locator('.notice strong');await expect(code).toHaveText(/^\d{6}$/);
  await page.getByLabel('Código de 6 dígitos',{exact:true}).fill(await code.innerText());
  await page.getByRole('button',{name:'Verificar y continuar',exact:true}).click();
  await expect(page).toHaveURL(/\/panel\/empezar$/);
  await expect(page.getByRole('heading',{name:'¡Bienvenido a Vendo!',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:900});await noOverflow(page);
  for(const number of [1,2]) {
    await page.getByRole('link',{name:number===1?'Crear mi primer producto':'Añadir otro producto',exact:true}).click();
    await page.getByLabel('Nombre del producto',{exact:true}).fill('Producto de registro '+number);
    await page.getByLabel('Categoría',{exact:true}).selectOption('hogar');
    await page.getByLabel('Tu precio por unidad (S/)',{exact:true}).fill('25');
    await page.getByLabel('¿Cuántas unidades tienes para vender?',{exact:true}).fill('20');
    await page.getByLabel('Mínimo de unidades por compra',{exact:true}).fill('2');
    await page.getByText('Descripción (opcional)',{exact:true}).click();await page.getByLabel('Descripción del producto',{exact:true}).fill('Caja de cerámica con presentación y cantidades descritas.');
    await page.getByRole('button',{name:'Guardar y seguir con mi catálogo',exact:true}).click();
    await expect(page).toHaveURL(/\/panel\/producto-guardado/);
    await expect(page.getByRole('heading',{name:'¡Producto guardado correctamente!',exact:true})).toBeVisible();
  }
  await page.goto('/panel/productos');await page.reload();await expect(page.getByRole('link',{name:'Producto de registro 2',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/registro-catalogo-390.png',fullPage:true});
  await page.goto('/cuenta/seguridad');await expect(page.getByText('Verificado: +51987654321',{exact:true})).toBeVisible();
  await expect(page.getByText('Correo de contacto. Su verificación no es necesaria para usar tu cuenta.',{exact:true})).toBeVisible();
  await page.getByLabel('Contraseña actual',{exact:true}).fill(password);await page.getByLabel('Nueva contraseña',{exact:true}).fill(password+'-nueva');await page.getByLabel('Repetir nueva contraseña',{exact:true}).fill(password+'-nueva');
  await page.getByRole('button',{name:'Actualizar contraseña'}).click();await expect(page).toHaveURL(/\/login$/);
});

test('producto sencillo: 1100 disponibles, mínimo 1 y código automático sin opciones avanzadas',async({page})=>{
  const accounts=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8'));
  await login(page,accounts.sellerA);await page.goto('/panel/productos/nuevo');
  await page.getByLabel('Nombre del producto',{exact:true}).fill('Prueba de cantidades claras');
  await page.getByLabel('Categoría',{exact:true}).selectOption('hogar');
  await page.getByLabel('Tu precio por unidad (S/)',{exact:true}).fill('12');
  const resalePrice=page.getByLabel('Precio sugerido de reventa (S/, opcional)',{exact:true});
  await expect(resalePrice).toBeVisible();
  await resalePrice.fill('32.50');
  await page.getByText('Comparar precios e impuestos (opcional)',{exact:true}).click();await page.locator('[name=same_tax_basis]').check();
  await expect(page.locator('#resale-preview')).toContainText(/20\.50/);
  await page.getByLabel('¿Cuántas unidades tienes para vender?',{exact:true}).fill('1100');
  await expect(page.getByLabel('Mínimo de unidades por compra',{exact:true})).toHaveValue('1');
  await expect(page.locator('#quantity-preview')).toContainText('Tienes 1100 unidades en total. Cada pedido empieza desde 1 unidad.');
  await expect(page.getByLabel('Código del producto (se crea automáticamente si lo dejas vacío)')).not.toBeVisible();
  await page.setViewportSize({width:390,height:900});await noOverflow(page);
  await page.getByRole('button',{name:'Guardar producto',exact:true}).click();await expect(page).toHaveURL(/\/panel\/producto-guardado/);await page.getByRole('link',{name:'Ver mi catálogo',exact:true}).click();
  const products=await (await page.request.get('/api/seller/products')).json(),p=products.find(p=>p.name==='Prueba de cantidades claras');
  expect(p.moq).toBe(1);expect(p.total).toBe(1100);expect(p.sku).toMatch(/^LOTE-/);expect(p.status).toBe('pending');
  expect(p.retail_cents).toBe(3250);expect(p.same_tax_basis).toBe(true);
  await page.getByRole('link',{name:'Prueba de cantidades claras',exact:true}).click();
  await expect(page.getByLabel('Precio sugerido de reventa (S/, opcional)',{exact:true})).toHaveValue('32.50');
});

test('la marca selecciona regiones con casillas y las conserva al guardar',async({page})=>{
  const accounts=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8'));
  await login(page,accounts.sellerA);await page.goto('/panel/marca');
  await expect(page.getByLabel('Lima',{exact:true})).toBeChecked();
  await page.getByLabel('Áncash',{exact:true}).check();
  await page.getByRole('button',{name:'Guardar condiciones',exact:true}).click();
  await expect(page.locator('#toast')).toHaveText('Condiciones guardadas.');
  await page.reload();await expect(page.getByLabel('Áncash',{exact:true})).toBeChecked();
  await expect(page.getByLabel('Lima',{exact:true})).toBeChecked();
  const organization=await (await page.request.get('/api/organizations/me')).json();
  expect(organization.brand.shipping_regions).toEqual(expect.arrayContaining(['ancash','lima']));
  await page.setViewportSize({width:390,height:900});await noOverflow(page);
});


test('paneles operativos y simulador 7%: sin errores ni desbordes en móvil',async({browser})=>{
  const accounts=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8'));
  for(const [role,paths] of [['sellerA',['/panel/inventario','/panel/envios','/panel/incidencias','/panel/tiendas','/panel/finanzas']],['admin',['/administracion/finanzas','/administracion/logistica','/administracion/lanzamiento']]]) {
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    try {
      await login(page,accounts[role]);
      for(const path of paths) {
        await page.goto(path);await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByRole('heading',{name:'No pudimos completar esta vista.'})).toHaveCount(0);
        await page.setViewportSize({width:390,height:900});await noOverflow(page);
      }
      await page.goto(role==='admin'?'/administracion/finanzas':'/panel/finanzas');if(role!=='admin')await page.getByText('Dinero y comisiones',{exact:true}).click();
      await expect(page.locator('#fee-simulation')).toContainText('70.00');
      await page.getByLabel('Total de productos (S/)',{exact:true}).fill('1400');
      await expect(page.locator('#fee-simulation')).toContainText('98.00');
      const calculator=page.locator('.card').filter({has:page.getByRole('heading',{name:'Comisión de Vendo',exact:true})}).last();
      await expect(calculator).not.toContainText(/IGV|Procesamiento|Neto estimado/);
      await expect(page.locator('#fee-simulation dt')).toHaveCount(1);
      await page.screenshot({path:`test-results/finanzas-${role}-390.png`,fullPage:true});
      expect(errors).toEqual([]);
    } finally {await context.close();}
  }
});

test('registro de marca dedicado: diseño adaptable, pasos y datos opcionales',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,768,390,360]) {
    await page.setViewportSize({width,height:1000});await page.goto('/registro?tipo=proveedor');
    await expect(page.getByRole('heading',{name:'Crea el espacio de tu marca',exact:true})).toBeVisible();
    await expect(page.locator('.brand-steps [aria-current=step]')).toContainText('Tu marca');
    await expect(page.locator('[data-form=auth] input[name=kind]')).toHaveValue('seller');
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByLabel('Tu número de celular',{exact:true})).toBeVisible();
    await expect(page.getByLabel('RUC (opcional)',{exact:true})).toBeHidden();
    await noOverflow(page);await page.screenshot({path:`test-results/registro-marca-${width}.png`,fullPage:true});
  }
  await page.getByLabel('Contraseña · mínimo 12 caracteres',{exact:true}).fill('Password-de-prueba-2026');
  await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();
  await expect(page.locator('[name=password]')).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();
  await expect(page.locator('[name=password]')).toHaveAttribute('type','password');
  await page.getByText('Datos legales (opcional por ahora)',{exact:true}).click();
  await expect(page.getByLabel('RUC (opcional)',{exact:true})).toBeVisible();
  await noOverflow(page);expect(errors).toEqual([]);
});

test('compras cerradas: producto, bolsa y enlace de pago muestran No disponible',async({page})=>{
  const accounts=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8'));
  await page.route('**/api/me',async route=>{
    const response=await route.fetch(),data=await response.json();
    await route.fulfill({response,json:{...data,purchasesEnabled:false}});
  });
  await page.route(/\/api\/products\/closed-product$/,route=>route.fulfill({json:{
    id:'closed-product',name:'Producto de prueba',brand_id:'brand',brand_name:'Marca',
    sku:'PRUEBA',images:[],specifications:{},description:'Descripción',
    wholesale_cents:1000,retail_cents:2000,margin_percent:50,moq:1,pack_multiple:1,
    available:100,source_updated_at:new Date().toISOString(),stockMaxAgeHours:48,
    min_order_cents:0,shipping_cents:0,shipping_regions:['lima'],preparation_days:1,
    shipping_policy:'Despacho',return_policy:'Condiciones'
  }}));
  await page.route('**/api/products/closed-product/reviews',route=>route.fulfill({json:[]}));
  await page.goto('/productos/closed-product');
  await expect(page.getByRole('button',{name:'No disponible',exact:true})).toBeDisabled();
  await expect(page.locator('[data-form=add-cart]')).toHaveCount(0);
  await login(page,accounts.buyerA);
  for(const path of ['/productos/closed-product','/checkout/reserva-anterior']) {
    await page.goto(path);
    await expect(page.getByRole('button',{name:'No disponible',exact:true})).toBeDisabled();
    await expect(page.locator('[data-form=checkout],[data-form=add-cart],[data-action=simulate]')).toHaveCount(0);
    await page.setViewportSize({width:390,height:900});await noOverflow(page);
  }
});
