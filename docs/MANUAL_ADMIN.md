# Manual de Uso para Administrador

Fecha: 2026-03-08

Este manual explica, de forma simple, qué puede hacer el rol `admin` y cómo usar cada sección sin romper la consistencia del sistema.

## Idea principal

Como administrador, tu trabajo no es “mover números” a mano.
Tu trabajo es usar el flujo correcto para cada caso:

- si entra mercadería: `Reposición`
- si se vende: `Registrar venta`
- si se pierde o daña: `Merma`
- si aparece stock no registrado: `Regularización`
- si hay que mover stock entre sucursales: `Transferencias`

Si usas el flujo correcto, inventario y reportes quedan consistentes.

## 1. Qué puede hacer un admin

El rol `admin` puede usar:
- `Inventario`
- `Catálogo`
- `Sucursales`
- `Personal`
- `Registrar venta`
- `Transferencias`
- `Reportes`

## 2. Antes de empezar

Antes de operar, revisa esto:

1. Tu sesión debe estar iniciada con un usuario `admin`.
2. Las sucursales deben existir correctamente.
3. Los productos deben estar creados antes de mover stock.
4. El personal debe tener rol y sucursal asignada.

## 3. Catálogo

Ruta: `Catálogo`

Aquí administras los productos.

Puedes:
- crear productos
- editar marca, modelo, nombre, código y precio
- cambiar imagen
- eliminar productos

Úsalo cuando:
- entra una nueva línea de productos
- hay que corregir datos del producto
- necesitas actualizar imagen o precio base

Evita:
- crear productos duplicados
- eliminar productos sin revisar si ya tienen inventario o movimientos

## 4. Sucursales

Ruta: `Sucursales`

Aquí administras las sucursales del sistema.

Puedes:
- crear sucursales
- cambiar nombre
- cargar o cambiar logo
- cargar o cambiar QR

Úsalo cuando:
- abres una nueva sucursal
- cambias branding
- actualizas el QR de cobro

## 5. Personal

Ruta: `Personal`

Aquí administras los usuarios.

Puedes:
- ver todos los usuarios
- ver solicitudes pendientes
- cambiar rol
- asignar sucursal
- aprobar personal
- eliminar usuarios

### Flujo recomendado para habilitar a una persona

1. La persona se registra.
2. Entras a `Personal`.
3. Buscas su usuario.
4. Le asignas rol `personal`.
5. Le asignas una sucursal.
6. Guardas.

Resultado:
- el usuario queda habilitado para operar en su sucursal

Importante:
- no dejes usuarios `personal` sin sucursal
- da rol `admin` solo cuando sea realmente necesario

## 6. Inventario

Ruta: `Inventario`

Esta es la sección más delicada.
Aquí ves el stock real y registras movimientos auditables.

### 6.1 Consultar stock

Pasos:
1. Busca el producto.
2. Abre el detalle.
3. Revisa stock por talla y por sucursal.

### 6.2 Reposición o compra

Úsalo cuando:
- entra mercadería nueva
- quieres cargar stock comprado

Pasos:
1. Abre el producto.
2. Elige la sucursal.
3. Entra a `Compra (lotes)`.
4. Ingresa talla, cantidad y costo unitario.
5. Agrega proveedor o nota si quieres.
6. Guarda.

Qué hace el sistema:
- suma stock
- crea lotes FIFO
- registra la compra para reportes

### 6.3 Merma

Úsalo cuando:
- un producto se rompió
- se perdió
- hubo daño real

Pasos:
1. Entra a `Merma`.
2. Elige motivo.
3. Ingresa talla y cantidad.
4. Guarda.

Qué hace el sistema:
- descuenta stock
- calcula costo por lotes
- registra la salida como merma, no como venta

### 6.4 Regularización

Úsalo cuando:
- aparece stock que no estaba registrado
- haces un ajuste positivo por conteo

Pasos:
1. Entra a `Regularización`.
2. Elige motivo.
3. Agrega nota si hace falta.
4. Ingresa talla y cantidad.
5. Si conoces el costo, colócalo.
6. Guarda.

Qué hace el sistema:
- suma stock
- crea lotes de regularización
- deja rastro en auditoría

No lo uses para:
- reemplazar una compra real
- tapar errores sin explicación

## 7. Registrar venta

Ruta: `Registrar venta`

Aquí registras ventas normales.

Pasos:
1. Busca el producto.
2. Agrega cantidades por talla.
3. Revisa el carrito.
4. Elige método de pago.
5. Confirma.

Qué hace el sistema:
- descuenta stock
- consume lotes FIFO
- calcula costo y margen
- actualiza ventas y reportes

Importante:
- aquí ya no se solicitan transferencias
- si falta stock, el flujo correcto está en `Transferencias`

## 8. Transferencias

Ruta: `Transferencias`

Aquí se solicita y se gestiona el movimiento de stock entre sucursales.

El admin puede:
- crear transferencias
- marcar transferencias como `transferido`
- anular transferencias pendientes

### 8.1 Crear transferencia

Pasos:
1. Selecciona sucursal origen.
2. Selecciona sucursal destino.
3. Busca el producto.
4. Agrega tallas y cantidades.
5. Guarda.

Resultado:
- la transferencia queda `pendiente`
- todavía no mueve stock

### 8.2 Marcar como transferido

Úsalo cuando el movimiento realmente se realizó.

Resultado:
- se descuenta stock en origen
- se suma stock en destino
- queda trazabilidad del movimiento

### 8.3 Anular transferencia

Úsalo cuando:
- la solicitud fue incorrecta
- ya no se va a ejecutar
- fue duplicada

Resultado:
- la transferencia queda `anulada`
- no mueve stock

## 9. Reportes

Ruta: `Reportes`

Esta sección te ayuda a revisar qué pasó y cómo está el sistema.

### Vista principal

Ves un resumen por sucursal de:
- `Ventas`
- `Reposiciones`
- `Ajustes`
- `Transferencias`
- `Stock actual`

### Vista detalle por sucursal

Cuando pulsas `Ver`, puedes entrar a:
- `Ventas`
- `Reposiciones`
- `Ajustes`
- `Transferencias`
- `Stock actual`

### Cómo leer cada parte

- `Ventas`: dinero, costo, margen, método de pago y detalle vendido
- `Reposiciones`: compras cargadas como lotes
- `Ajustes`: mermas y regularizaciones
- `Transferencias`: entradas y salidas entre sucursales
- `Stock actual`: foto real del inventario vivo

## 10. Orden recomendado de trabajo

Si quieres operar con menos errores, sigue este orden:

1. Crea o corrige productos en `Catálogo`.
2. Revisa que las sucursales estén bien configuradas.
3. Habilita al personal y asígnale sucursal.
4. Registra reposiciones con costo correcto.
5. Registra ventas.
6. Usa transferencias cuando una sucursal necesite stock de otra.
7. Usa merma o regularización solo cuando realmente corresponda.
8. Revisa reportes para validar que todo cuadre.

## 11. Errores comunes

### “No tienes permisos”

Revisa:
- que tu usuario realmente sea `admin`
- que la sesión esté activa

### “Sin costo”

Normalmente significa:
- stock viejo sin traza completa
- regularización sin costo informado

### “El stock no cuadra”

Antes de hacer otra corrección, revisa:
- ventas
- ajustes
- transferencias

### “Un usuario no puede operar”

Revisa en `Personal`:
- su rol
- su sucursal asignada

## 12. Buenas prácticas

- registra compras con costo unitario correcto
- no uses merma para arreglar errores de venta
- no uses regularización como reemplazo de compra
- no dupliques transferencias
- agrega notas cuando el movimiento no sea obvio
- revisa reportes después de cambios importantes
