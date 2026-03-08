# Manual de Uso para Personal de Sucursal

Fecha: 2026-03-08

Este manual explica, de forma simple, qué puede hacer el rol `personal` y cómo usar la app correctamente en el trabajo diario.

## Idea principal

Tu trabajo como `personal` es operar, no corregir stock manualmente.

Usa cada sección para lo que fue diseñada:
- `Inventario`: consultar stock
- `Registrar venta`: vender
- `Transferencias`: solicitar movimientos entre sucursales

No debes usar flujos improvisados para “arreglar” inventario.

## 1. Qué puede hacer el personal

El rol `personal` usa principalmente:
- `Inventario`
- `Catálogo`
- `Registrar venta`
- `Transferencias`

En general:
- puede consultar productos y stock
- puede registrar ventas
- puede solicitar transferencias
- no administra usuarios
- no administra catálogo
- no debe registrar compras, mermas o regularizaciones

## 2. Antes de empezar

Antes de trabajar, revisa esto:

1. Tu cuenta debe tener rol `personal`.
2. Debes tener una sucursal asignada.
3. Debes poder entrar al panel sin ser enviado al registro.

Si no puedes operar:
- pide al admin que revise tu rol y tu sucursal

## 3. Inventario

Ruta: `Inventario`

Aquí consultas stock.

Pasos:
1. Busca el producto.
2. Abre el detalle.
3. Revisa stock por talla.
4. Revisa en qué sucursales hay disponibilidad.

Úsalo cuando:
- quieras confirmar si una talla está disponible
- necesites revisar stock antes de vender
- quieras ver si otra sucursal tiene el producto

Importante:
- para `personal`, esta sección es de lectura
- no debes registrar compras, mermas ni regularizaciones

## 4. Catálogo

Ruta: `Catálogo`

Aquí puedes buscar productos y ver su información.

Puedes buscar por:
- marca
- modelo
- nombre
- código

Importante:
- no creas productos
- no editas productos

## 5. Registrar venta

Ruta: `Registrar venta`

Esta pantalla sirve solo para vender.

Pasos:
1. Busca el producto.
2. Agrega cantidades por talla usando `+` y `-`.
3. Revisa el carrito.
4. Elige método de pago.
5. Confirma la venta.

Qué hace el sistema:
- descuenta stock de tu sucursal
- registra la venta
- actualiza el historial y los cálculos internos

Importante:
- si una talla no tiene stock, aquí no se solicita transferencia
- `Registrar venta` ya no tiene flujo de solicitud

Si falta una talla:
- ve a `Transferencias`

## 6. Transferencias

Ruta: `Transferencias`

Esta es la única sección donde se solicita stock a otra sucursal.

### Cómo funciona para personal

Para el rol `personal`:
- tu sucursal es el `destino`
- tú eliges la sucursal `origen`

En palabras simples:
- eliges de qué sucursal te van a enviar el producto
- el producto llegará a tu sucursal

### Pasos para solicitar una transferencia

1. Entra a `Transferencias`.
2. Revisa que tu sucursal aparezca como destino.
3. Elige la sucursal origen.
4. Busca el producto.
5. Agrega tallas y cantidades.
6. Guarda.

Resultado:
- la solicitud queda en estado `pendiente`
- todavía no mueve stock

### Qué puedes revisar

En la tabla puedes ver:
- origen
- destino
- estado
- fecha
- detalle de productos y tallas

Estados comunes:
- `pendiente`
- `transferido`
- `anulada`

## 7. Qué hacer si algo sale mal

### No hay stock de una talla

Haz esto:
- no inventes una venta
- no intentes corregir inventario
- solicita transferencia desde `Transferencias`

### No puedes operar

Revisa con el admin:
- tu rol
- tu sucursal asignada

### No ves una opción que esperabas

Puede ser normal.
Por ejemplo:
- `Inventario` para personal es solo consulta
- `Registrar venta` ya no solicita transferencias

## 8. Buenas prácticas

- revisa siempre talla y cantidad antes de vender
- usa `Transferencias` solo cuando realmente necesites stock de otra sucursal
- no compartas tu cuenta
- si ves stock raro, no lo corrijas tú: repórtalo al admin
- usa la sección correcta para cada acción

## 9. Resumen rápido

Si eres `personal`, piensa así:

- quiero revisar stock: `Inventario`
- quiero buscar un producto: `Catálogo`
- quiero vender: `Registrar venta`
- me falta una talla y otra sucursal sí la tiene: `Transferencias`

No uses:
- `Registrar venta` para pedir transferencias
- `Inventario` para corregir stock
- flujos manuales para compensar errores
