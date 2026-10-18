# Lote — página principal

Prototipo visual de un marketplace mayorista que conecta marcas y proveedores con tiendas independientes. La página explica el modelo y permite recorrer categorías, selecciones, búsqueda, compra mínima y ordenamiento. El catálogo permanece vacío hasta conectar productos reales.

## Ver el sitio

1. En el repositorio de GitHub, selecciona **Code → Download ZIP** y extrae el contenido en `C:\Users\Rodolfo\Documents\Lote`.
2. Abre esa carpeta en Visual Studio Code.
3. Para verlo en `http://localhost:3000`, abre **Terminal → Nuevo terminal** y ejecuta `py -m http.server 3000`.
4. Si Python no reconoce `py`, usa `python -m http.server 3000`. Abre `http://localhost:3000` en el navegador y detén el servidor con `Ctrl + C`.

También se puede abrir `index.html` directamente o usar la extensión Live Server.

## Catálogo y filtros

`app.js` consulta `GET /api/products` y también acepta el arreglo `window.LOTE_PRODUCTS`. Campos esperados por producto:

```json
{
  "name": "Nombre del producto",
  "category": "Hogar",
  "brand": "Marca",
  "wholesalePrice": 24.9,
  "retailPrice": 39.9,
  "minUnits": 12,
  "stock": 50,
  "image": "/images/producto.jpg",
  "isNew": true,
  "tags": ["nuevo"],
  "createdAt": "2026-10-18"
}
```

También se acepta `price` como precio mayorista y `seller` como proveedor. Los filtros trabajan con categoría, texto, mínimo de compra, novedades, lotes pequeños y margen. La selección de margen estima `(PVP - precio mayorista) / PVP`; es una referencia bruta, no una promesa de rentabilidad, pues no contempla otros costos del negocio.

**La interfaz todavía no conecta una base de datos, proveedores, inventario real, carrito ni pedidos.** Para cargar productos automáticamente hace falta implementar la fuente de catálogo y exponer el endpoint o publicar `window.LOTE_PRODUCTS`.

## Archivos

- `index.html`: contenido semántico y estructura de la portada.
- `styles.css`: tipografía, jerarquía visual, categorías y diseño adaptable.
- `app.js`: filtros, selecciones, menú móvil y renderizado del catálogo.

La tipografía DM Sans y Manrope se carga desde Google Fonts; se usan fuentes del sistema como respaldo.
