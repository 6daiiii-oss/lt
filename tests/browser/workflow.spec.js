import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
const widths=[1440,1024,768,390,360];
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
async function login(page,account){await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(account.email);await page.getByLabel('Contraseña',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
test('portada y catálogo vacío responsive, filtros compartibles, historial, etiquetas, foco y error',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of widths){await page.setViewportSize({width,height:1000});await page.goto('/');await expect(page.getByRole('heading',{name:/Compra directo/})).toBeVisible();await noOverflow(page);await page.goto('/catalogo');await expect(page.getByRole('heading',{name:'Aún no hay productos publicados'})).toBeVisible();await noOverflow(page);await page.screenshot({path:`test-results/catalogo-vacio-${width}.png`,fullPage:true});}
  await page.getByRole('searchbox',{name:'Buscar productos y marcas',exact:true}).fill('consulta sin resultados');await page.getByRole('searchbox',{name:'Buscar productos y marcas',exact:true}).press('Enter');await expect(page).toHaveURL(/q=consulta/);await expect(page.getByRole('heading',{name:'No encontramos productos'})).toBeVisible();
  await page.goBack();await expect(page.getByRole('searchbox',{name:'Buscar productos y marcas',exact:true})).toHaveValue('');
  const unlabelled=await page.locator('input,select,textarea').evaluateAll(inputs=>inputs.filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')).length);expect(unlabelled).toBe(0);
  await page.getByRole('link',{name:'Saltar al contenido'}).focus();await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
  await page.route('**/api/products?**',route=>route.abort());await page.goto('/catalogo?q=fallo');await expect(page.getByRole('heading',{name:'No pudimos completar esta vista.'})).toBeVisible();await noOverflow(page);expect(errors).toEqual([]);
});
test('proveedores → catálogo moderado → bolsa multimarcas → sandbox → entrega → reseña, incidencia y recompra',async({browser})=>{
  const accounts=JSON.parse(await readFile('.runtime/ui-accounts.json','utf8'));
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext(),browser.newContext()]);
  const [sellerA,sellerB,buyer,admin]=await Promise.all(contexts.map(c=>c.newPage()));
  try{
    await login(sellerA,accounts.sellerA);await sellerA.goto('/panel/productos/nuevo');
    await sellerA.getByText('Más opciones (opcional): color, características y venta por paquetes',{exact:true}).click();
    await sellerA.getByLabel('Nombre del producto',{exact:true}).fill('DEMO Vaso editorial');await sellerA.getByLabel('Código del producto (se crea automáticamente si lo dejas vacío)').fill('UI-A');await sellerA.getByLabel('Categoría',{exact:true}).selectOption('hogar');
    await sellerA.getByLabel('Tu precio por unidad (S/)').fill('2.50');await sellerA.getByLabel('Precio sugerido de reventa (S/, opcional)').fill('5.00');await sellerA.getByLabel('Mínimo de unidades por compra').fill('6');await sellerA.getByLabel('¿Se vende en grupos de cuántas unidades?').fill('6');await sellerA.getByLabel('¿Cuántas unidades tienes para vender?').fill('60');
    await expect(sellerA.locator('#price-preview')).toContainText('2.50');
    const photoA=await sharp({create:{width:100,height:100,channels:3,background:'#173f35'}}).png().toBuffer();
    const photoB=await sharp({create:{width:100,height:100,channels:3,background:'#e8b366'}}).png().toBuffer();
    await sellerA.getByLabel('Añadir fotos desde tu computadora').setInputFiles([{name:'foto-a.png',mimeType:'image/png',buffer:photoA},{name:'foto-b.png',mimeType:'image/png',buffer:photoB}]);
    await expect(sellerA.getByText('Fotos listas. Guarda el producto para conservar los cambios.',{exact:true})).toBeVisible();
    await expect(sellerA.locator('.photo-tile')).toHaveCount(2);
    await sellerA.getByRole('button',{name:'Usar de portada',exact:true}).click();
    await sellerA.getByRole('button',{name:'Añadir característica',exact:true}).click();await sellerA.getByLabel('Característica',{exact:true}).fill('Material');await sellerA.getByLabel('Detalle',{exact:true}).fill('Cerámica');
    await sellerA.getByLabel('El precio de reventa corresponde a la misma unidad e incluye los mismos impuestos que mi precio.').check();await sellerA.getByLabel('Enviar a Vendo para que revise y publique el producto').check();await sellerA.getByRole('button',{name:'Guardar producto',exact:true}).click();await expect(sellerA).toHaveURL(/\/panel\/productos$/);
    await login(sellerB,accounts.sellerB);await sellerB.goto('/panel/productos/nuevo');
    await sellerB.getByLabel('Nombre del producto',{exact:true}).fill('DEMO Cuaderno, azul');await sellerB.getByLabel('Categoría',{exact:true}).selectOption('hogar');
    await sellerB.getByLabel('Tu precio por unidad (S/)').fill('4.00');await sellerB.getByLabel('Mínimo de unidades por compra').fill('3');await sellerB.getByLabel('¿Cuántas unidades tienes para vender?').fill('30');
    await sellerB.getByRole('button',{name:'Guardar producto',exact:true}).click();await expect(sellerB).toHaveURL(/\/panel\/productos$/);
    await login(admin,accounts.admin);await admin.goto('/administracion/catalogo');
    for(const name of ['DEMO Vaso editorial','DEMO Cuaderno, azul']){const card=admin.locator('.record').filter({has:admin.getByRole('heading',{name,exact:true})});await card.getByRole('button',{name:'Publicar producto',exact:true}).click();await expect(card.getByText('Publicado',{exact:true})).toBeVisible();}
    await login(buyer,accounts.buyerA);
    let productUrl;
    for(const name of ['DEMO Vaso editorial','DEMO Cuaderno, azul']){await buyer.goto('/catalogo');await buyer.getByRole('heading',{name,exact:true}).getByRole('link').click();await expect(buyer.getByRole('heading',{name,exact:true})).toBeVisible();if(!productUrl){productUrl=new URL(buyer.url()).pathname;await expect(buyer.locator('.photo-thumbs button')).toHaveCount(2);const first=await buyer.locator('[data-photo-main]').getAttribute('src');await buyer.getByRole('button',{name:'Ver foto 2',exact:true}).click();await expect(buyer.locator('[data-photo-main]')).not.toHaveAttribute('src',first);}await buyer.getByRole('button',{name:'Añadir a mi bolsa'}).click();await expect(buyer.getByRole('status')).toHaveText('Producto añadido a tu bolsa.');}
    await buyer.goto('/carrito');await expect(buyer.getByRole('heading',{name:'Buenas elecciones, juntas.'})).toBeVisible();await expect(buyer.locator('.summary-dl .total').last()).toContainText('35.00');await buyer.getByLabel('Revisé cantidades, cobertura, precios, envío y condiciones de cada proveedor.').check();await buyer.getByRole('button',{name:'Continuar al pago de prueba'}).click();await expect(buyer).toHaveURL(/\/checkout\/[^/]+$/);await buyer.getByRole('button',{name:'Completar compra de prueba'}).click();await expect(buyer.getByText('Aprobado',{exact:true})).toBeVisible();
    await buyer.goto('/pedidos');const links={};for(const letter of ['A','B']){const row=buyer.getByRole('row').filter({hasText:'DEMO Marca '+letter});links[letter]=await row.getByRole('link').getAttribute('href');}
    for(const [letter,seller] of [['A',sellerA],['B',sellerB]]){await seller.goto('/panel'+links[letter]);await seller.getByRole('button',{name:'Aceptar y preparar pedido'}).click();await expect(seller.getByRole('button',{name:'Registrar despacho'})).toBeVisible();await seller.getByLabel('Transportista',{exact:true}).fill('DEMO Transportista');await seller.getByLabel('Código de seguimiento').fill('DEMO-ENVIO-'+letter);await seller.getByRole('button',{name:'Registrar despacho'}).click();await expect(seller.getByText('Enviado',{exact:true})).toBeVisible();await buyer.goto(links[letter]);await buyer.getByRole('button',{name:'Confirmar que recibí el pedido'}).click();await expect(buyer.getByText('Entregado',{exact:true})).toBeVisible();}
    await buyer.goto(links.A);await buyer.getByText('Escribir una reseña',{exact:true}).click();await buyer.getByLabel('Tu experiencia de compra').fill('Producto de demostración entregado en el recorrido de pruebas.');await buyer.getByRole('button',{name:'Enviar a moderación'}).click();await expect(buyer.getByRole('status')).toHaveText('Reseña enviada a moderación.');
    await buyer.getByText('Abrir una incidencia',{exact:true}).click();await buyer.getByLabel('Cuéntanos qué ocurrió').fill('Consulta de demostración sobre el empaque recibido.');await buyer.getByRole('button',{name:'Abrir incidencia',exact:true}).click();await expect(buyer).toHaveURL(/\/incidencias\//);await buyer.getByLabel('Tu respuesta').fill('Detalle adicional de la evidencia de prueba.');await buyer.getByRole('button',{name:'Enviar respuesta'}).click();await expect(buyer.getByText('Detalle adicional de la evidencia de prueba.',{exact:true})).toBeVisible();
    const image=await sharp({create:{width:10,height:10,channels:3,background:'#173f35'}}).png().toBuffer();await buyer.getByLabel('Adjuntar una imagen privada').setInputFiles({name:'evidencia.png',mimeType:'image/png',buffer:image});await buyer.getByRole('button',{name:'Adjuntar evidencia'}).click();await expect(buyer.getByRole('link',{name:/Ver imagen/})).toBeVisible();
    await buyer.goto(links.A);await buyer.getByRole('button',{name:'Revisar recompra'}).click();await expect(buyer.getByRole('button',{name:'Revisé los cambios: añadir a mi bolsa'})).toBeVisible();await buyer.getByRole('button',{name:'Revisé los cambios: añadir a mi bolsa'}).click();await expect(buyer).toHaveURL(/\/carrito$/);
    for(const width of widths){await buyer.setViewportSize({width,height:1000});for(const path of ['/catalogo',productUrl,'/carrito',links.A]){await buyer.goto(path);await expect(buyer.locator('h1')).toBeVisible();await expect(buyer.getByRole('heading',{name:'No pudimos completar esta vista.'})).toHaveCount(0);await noOverflow(buyer);}await sellerA.setViewportSize({width,height:1000});await sellerA.goto('/panel/productos');await expect(sellerA.getByRole('heading',{name:'Productos con toda la información.'})).toBeVisible();await noOverflow(sellerA);}
    await buyer.screenshot({path:'test-results/pedido-movil.png',fullPage:true});
  }finally{await Promise.all(contexts.map(context=>context.close().catch(()=>{})));}
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
  await expect(page.getByRole('heading',{name:'Crea tu primer producto',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:900});await noOverflow(page);
  for(const number of [1,2]) {
    await page.getByRole('link',{name:number===1?'Crear mi primer producto':'Añadir otro producto',exact:true}).click();
    await page.getByLabel('Nombre del producto',{exact:true}).fill('Producto de registro '+number);
    await page.getByLabel('Categoría',{exact:true}).selectOption('hogar');
    await page.getByLabel('Tu precio por unidad (S/)',{exact:true}).fill('25');
    await page.getByLabel('¿Cuántas unidades tienes para vender?',{exact:true}).fill('20');
    await page.getByLabel('Mínimo de unidades por compra',{exact:true}).fill('2');
    await page.getByLabel('Descripción del producto',{exact:true}).fill('Caja de cerámica con presentación y cantidades descritas.');
    await page.getByRole('button',{name:'Guardar y seguir con mi catálogo',exact:true}).click();
    await expect(page).toHaveURL(/\/panel\/empezar$/);
    await expect(page.getByRole('link',{name:'Producto de registro '+number,exact:true})).toBeVisible();
  }
  await page.reload();await expect(page.getByRole('link',{name:'Producto de registro 2',exact:true})).toBeVisible();
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
  await page.locator('[name=same_tax_basis]').check();
  await expect(page.locator('#resale-preview')).toContainText('S/20.50');
  await page.getByLabel('¿Cuántas unidades tienes para vender?',{exact:true}).fill('1100');
  await expect(page.getByLabel('Mínimo de unidades por compra',{exact:true})).toHaveValue('1');
  await expect(page.locator('#quantity-preview')).toContainText('Tienes 1100 unidades en total. Cada pedido empieza desde 1 unidad.');
  await expect(page.getByLabel('Código del producto (se crea automáticamente si lo dejas vacío)')).not.toBeVisible();
  await page.setViewportSize({width:390,height:900});await noOverflow(page);
  await page.getByRole('button',{name:'Guardar producto',exact:true}).click();await expect(page).toHaveURL(/\/panel\/productos$/);
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
  await expect(page.getByRole('status')).toHaveText('Condiciones guardadas.');
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
      await page.goto(role==='admin'?'/administracion/finanzas':'/panel/finanzas');
      await expect(page.locator('#fee-simulation')).toContainText('70.00');
      await page.getByLabel('Procesamiento cotizado al comprador (S/, opcional)',{exact:true}).fill('35');
      await expect(page.locator('#fee-simulation')).toContainText('70.00');
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
  for(const path of ['/productos/closed-product','/carrito','/checkout/reserva-anterior']) {
    await page.goto(path);
    await expect(page.getByRole('button',{name:'No disponible',exact:true})).toBeDisabled();
    await expect(page.locator('[data-form=checkout],[data-form=add-cart],[data-action=simulate]')).toHaveCount(0);
    await page.setViewportSize({width:390,height:900});await noOverflow(page);
  }
});
