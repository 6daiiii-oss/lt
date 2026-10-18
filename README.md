# Lote — página principal (primera versión)

Página estática adaptable a celular y computadora, sin dependencias de instalación. El catálogo arranca vacío y muestra un mensaje de próximos lanzamientos. El módulo `app.js` ya puede pintar tarjetas cuando recibe productos; la carga automática real requiere conectar una fuente de catálogo.

## Abrir el proyecto en Visual Studio Code

1. Descarga y extrae `Lote.zip`.
2. Copia los archivos extraídos (`index.html`, `styles.css`, `app.js` y este `README.md`) dentro de `C:\Users\Rodolfo\Documents\Lote`. Si el ZIP crea una carpeta `Lote`, copia su contenido para evitar que quede `Lote\Lote\index.html`.
3. Abre Visual Studio Code.
4. Selecciona **Archivo → Abrir carpeta…** y elige `C:\Users\Rodolfo\Documents\Lote`.
5. En el panel izquierdo, abre `index.html`. Para ver la página, haz clic derecho sobre el archivo y elige **Open with Live Server** si ya tienes esa extensión; también puedes abrir `index.html` directamente en Chrome o Edge.
6. Si usas Live Server, guarda cualquier cambio con `Ctrl + S` y el navegador se actualizará.

No hace falta pegar cada bloque de código por separado: el ZIP contiene los archivos listos para abrir y editar. Si prefieres copiar manualmente, crea los tres archivos con esos nombres exactos y pega en cada uno el contenido correspondiente.

## Cómo se mostrarán productos después

`app.js` consulta `GET /api/products`. La respuesta puede ser un arreglo JSON:

```json
[
  {
    "name": "Nombre del producto",
    "category": "Hogar",
    "seller": "Nombre del proveedor",
    "price": 24.9,
    "unit": "caja de 12",
    "image": "/images/producto.jpg"
  }
]
```

También acepta `{ "products": [ ... ] }`. Cuando la lista llegue vacía o el endpoint no exista, se conserva el estado vacío actual. Las tarjetas se generan con los datos recibidos.

**Importante:** esta versión solo contiene la interfaz. No consulta proveedores, no importa inventario por su cuenta y no guarda pedidos. Para que los productos aparezcan de forma autónoma habrá que conectar una base de datos y la fuente que los publicará (por ejemplo, un panel de proveedores, una integración o un backend). Las tarjetas y la sección vacía ya están preparadas para esa siguiente etapa.

## Archivos

- `index.html`: estructura y contenido de la página.
- `styles.css`: identidad visual y diseño adaptable.
- `app.js`: menú móvil y renderizado de productos del catálogo.

La tipografía se carga desde Google Fonts; con internet se verá como se diseñó. Sin conexión, el navegador usará tipografías de respaldo.
