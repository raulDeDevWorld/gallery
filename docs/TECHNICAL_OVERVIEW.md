# Documentacion Tecnica - Flujo del Sistema (Frontend + Firebase RTDB)

Fecha: 2026-03-06

Este documento explica el flujo tecnico (datos + operaciones) del sistema de tienda (catalogo, inventario por lotes, ventas, transferencias y reportes).

Nota: Para el esquema detallado de nodos, ver `docs/DB_SCHEMA.md`.

## 1) Arquitectura (resumen)

- App: Next.js (App Router) con componentes "client".
- Auth: Firebase Auth.
- Base de datos: Firebase Realtime Database (RTDB).
- Operaciones criticas: se ejecutan desde el frontend mediante funciones en `src/firebase/ops.js`.
- Seguridad: reglas RTDB en `database.rules.json`.

Objetivo del diseno:
- Inventario por talla siempre disponible en lectura rapida.
- Costo real por lotes (FIFO) al confirmar ventas, mermas y transferencias.
- Auditoria: todo cambio relevante genera un registro (venta, compra, merma, regularizacion, transferencia).
- Reporte historico eficiente: agregado diario por sucursal para evitar sumar miles de ventas.

## 2) Roles y permisos (modelo)

Nodo principal: `usuarios/{uid}`

Roles usados:
- `admin`: gestiona catalogo, sucursales, y tiene acceso completo a reportes.
- `personal`: opera en una sucursal asignada.
- `cliente`: acceso limitado (segun UI).

Campos importantes:
- `usuarios/{uid}/rol`
- `usuarios/{uid}/sucursalId`

## 3) Nodos y "fuentes de verdad"

Fuentes de verdad:
- Stock actual por sucursal/talla: `inventario/{sucursalId}/{productoId}/tallas/{talla}`
- Costo por lotes (FIFO): `lotesCompra/{sucursalId}/{productoId}/{talla}/{loteId}`
- Indice de lotes activos (saldo > 0): `lotesCompraActivos/{...}/{loteId} = creadoEn`
- Ventas: `ventas/{ventaId}` (incluye snapshot `consumoLotes`)
- Compras/reposiciones: `compras/{compraId}` + `comprasPorSucursal/{sid}/{compraId}`
- Movimientos (auditoria): `movimientosInventario/{movId}` + `movimientosPorSucursal/{sid}/{movId}`
- Transferencias: `transferencias/{transferenciaId}`
- Reporte agregado: `reportes/ventasPorSucursalDia/{sid}/{yyyymmdd}`

Caches/indices para performance:
- `inventarioTotales/{sid}/{pid}`: total por producto/sucursal.
- `ventasPorSucursal/{sid}/{ventaId}`: listar ventas por rango (orderByChild creadoEn).
- `comprasPorSucursal/{sid}/{compraId}`: listar compras por rango (orderByChild creadoEn).
- `movimientosPorSucursal/{sid}/{movId}`: listar mermas/regularizaciones/transferencias por rango (orderByChild creadoEn).

## 4) Invariantes de consistencia (importante)

Regla mental (para mantener reportes correctos):
- NO editar inventario "a mano". El stock cambia solo por operaciones auditables:
  - compra (lotes)
  - venta (salida)
  - merma (salida)
  - regularizacion (entrada con lote tipo regularizacion)
  - transferencia (salida origen + entrada destino)
- Las salidas que impactan costo (venta/merma/transferencia) consumen lotes FIFO y guardan snapshot del consumo.
- Si falta costo (stock viejo sin lotes), el sistema marca `costoIncompleto` para reportes ("Sin costo").

## 5) Flujos principales (operaciones y efectos)

### 5.1 Catalogo (productos)

UI: `src/features/products/ProductsPage.jsx`

Datos:
- `productos/{productoId}`: datos del producto + campos lower para busqueda.
- `productosPorMarca/{marcaLower}/{productoId} = true`: indice por marca.

Operacion:
- Guardado/edicion se hace con update multi-path para mantener indices (ver `src/firebase/ops.js`, ej. `guardarProducto()` si existe en el proyecto).

Riesgo tipico:
- Si cambia la marca de un producto, hay que actualizar `productosPorMarca` (borrar indice anterior y crear el nuevo), o queda "duplicado" en busqueda por marca.

### 5.2 Compra / Reposicion (crea lotes)

UI: Inventario (drawer por producto y sucursal)
- `src/features/inventory/InventoryPage.jsx` (modo `compra`)

Operacion: `registrarCompraInventarioProductoSucursal()` en `src/firebase/ops.js`

Efectos:
- Incrementa `inventario/{sid}/{pid}/tallas/*` (transaction).
- Actualiza `inventarioTotales/{sid}/{pid}`.
- Crea lotes por talla:
  - `lotesCompra/{sid}/{pid}/{talla}/{loteId}`
  - agrega a `lotesCompraActivos/.../{loteId} = creadoEn`
- Registra auditoria:
  - `compras/{compraId}`
  - `comprasPorSucursal/{sid}/{compraId}`
  - `movimientosInventario/compra_{compraId}`

Correccion de errores:
- "Anular reposicion" es posible solo si no se consumio nada del lote (lotes "nuevos").
  - Implementacion: `anularReposicionCompra()` en `src/firebase/ops.js`.

### 5.3 Venta (consumo FIFO automatico)

UI: `src/app/(with-auth)/RegistrarVenta/page.jsx` (carrito por talla).

Operacion: `registrarVenta()` en `src/firebase/ops.js`

Efectos:
- Consume lotes FIFO desde `lotesCompraActivos` + `lotesCompra`.
- Descuenta `inventario` y actualiza `inventarioTotales`.
- Guarda la venta con snapshot de costo:
  - `ventas/{ventaId}` con `consumoLotes`, `costoTotal`, `margenBruto`, `costoIncompleto`.
- Escribe vista por sucursal:
  - `ventasPorSucursal/{sid}/{ventaId}`
- Escribe auditoria:
  - `movimientosInventario/venta_{ventaId}` (tipo `venta_salida`)
- Actualiza reportes agregados:
  - `reportes/ventasPorSucursalDia/{sid}/{yyyymmdd}`

Correccion de errores:
- No se borra la venta. Se usa "Anular venta" (reverso auditable).
  - Implementacion: `anularVenta()` en `src/firebase/ops.js`
  - Revierte consumo FIFO (devuelve a lotes) + devuelve stock + ajusta reportes/vistas.

### 5.4 Merma (salida con costo, no es venta)

UI: Inventario (drawer) modo `merma`.

Operacion: `registrarMermaInventarioProductoSucursal()` en `src/firebase/ops.js`

Efectos:
- Consume FIFO (como venta) para calcular costo de perdida.
- Descuenta inventario.
- Registra `movimientosInventario/{movId}` tipo `merma` con `consumoLotes` y `costoTotal`.
- Registra `movimientosPorSucursal/{sid}/{movId}` para reportes por fecha.

Por que no se registra como "venta con precio 0":
- Porque contamina KPIs (cantidad de ventas, ticket, etc).
- Merma se reporta separado como salida sin ingreso.

### 5.5 Regularizacion (entrada auditable)

UI: Inventario (drawer) modo `regularizacion`.

Operacion: `registrarRegularizacionInventarioProductoSucursal()` en `src/firebase/ops.js`

Efectos:
- Incrementa inventario.
- Crea lote(s) tipo `regularizacion` para mantener consistencia FIFO a futuro.
  - Si costo es desconocido, se marca `costoDesconocido` y el reporte lo tratara como "Sin costo" cuando aplique.
- Registra `movimientosInventario/reg_{id}` y `movimientosPorSucursal/{sid}/reg_{id}`.

### 5.6 Transferencias (solicitud + confirmacion)

UI: `src/app/(with-auth)/Transferencias/page.jsx`

Modelo:
- `transferencias/{transferenciaId}` con `estado: pendiente | transferido | anulada`.

Operaciones en `src/firebase/ops.js`:
- `solicitarTransferencia()`: crea transferencia pendiente.
- `transferirTransferencia()`: confirma, mueve stock y lotes (FIFO).
- `anularTransferencia()`: anula pendiente (sin mover stock).

Permisos (reglas actuales):
- `admin`: puede solicitar, transferir y anular.
- `personal`:
  - Origen (`desdeSucursalId`): puede solicitar.
  - Destino (`haciaSucursalId`): puede marcar transferido y puede anular.

Efectos al confirmar (`transferido`):
- Consume FIFO en origen (costo).
- Descuenta inventario origen.
- Incrementa inventario destino.
- Crea lotes en destino por cada consumo (trazabilidad):
  - lote destino referencia `transferenciaId` y `origenLoteId` (segun implementacion).
- Registra movimientos:
  - `movimientosInventario/transferencia_salida_*`
  - `movimientosInventario/transferencia_entrada_*`
  - tambien aparecen en `movimientosPorSucursal/{sid}` para reportes por fecha.

Anular transferencia:
- Solo cuando esta `pendiente`.
- No toca inventario ni lotes, solo marca `estado='anulada'` y registra `movimientosInventario/transferencia_anulada_{id}`.

## 6) Reportes historicos (agregado + detalle)

UI: `src/features/reports/ReportsPage.jsx`

Modos:
- Vista inicial (todas las sucursales): resumen global + tabla por sucursal (ventas + reposiciones + inventario + transferencias).
- Vista por sucursal: tabla por dia (agregado diario).
- Detalle (click "Ver"): panel con tabs:
  - Ventas
  - Reposiciones
  - Inventario (merma/regularizacion)
  - Transferencias

Fuentes:
- Agregado rapido ventas: `reportes/ventasPorSucursalDia/{sid}/{yyyymmdd}`
- Detalle ventas: `ventasPorSucursal/{sid}` (por rango) + `ventas/{ventaId}` (solo para expandir y mostrar lotes).
- Detalle compras: `comprasPorSucursal/{sid}`.
- Detalle movimientos: `movimientosPorSucursal/{sid}`.

## 7) Idempotencia (anti duplicados)

Nodo: `idempotencias/{key}`

Se usa para evitar duplicados por doble click o mala red, especialmente en:
- registrarVenta
- transferirTransferencia
- anularVenta
- solicitarTransferencia / anularTransferencia (segun implementacion)

## 8) Checklist tecnico (prod readiness)

Datos y consistencia:
- [ ] Ninguna UI permite editar `inventario/*` directamente (solo lectura).
- [ ] Compra crea lotes y actualiza indices activos.
- [ ] Venta/Merma/Transferencia consumen FIFO y guardan snapshot (`consumoLotes`).
- [ ] Reversos existen: anular venta, anular reposicion (condicional), anular transferencia (pendiente).

Seguridad:
- [ ] `database.rules.json` cubre estados de transferencia (pendiente/transferido/anulada) y transiciones validas.
- [ ] Lecturas de `usuarios/{uid}` no fallan (evitar `permission_denied` en guard de rutas).

Performance/costos:
- [ ] Reporte agregado se usa para rangos largos.
- [ ] Indices `.indexOn` definidos donde se usa `orderByChild` (ventasPorSucursal, comprasPorSucursal, movimientosPorSucursal).

