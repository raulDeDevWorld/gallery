# Documentacion Tecnica - Flujo del Sistema

Fecha: 2026-03-08

Este documento describe el funcionamiento tecnico actual del frontend con Firebase Realtime Database.
El foco es explicar:

- cuales son las fuentes de verdad
- como se mueve el inventario
- como se calcula el costo
- como se alimentan los reportes
- que piezas son operativas y cuales son auxiliares

Nota:
- Para el detalle de nodos, ver `docs/DB_SCHEMA.md`.

## 1. Arquitectura actual

- App: Next.js App Router
- Estado global: `src/context/index.js`
- Auth: Firebase Auth
- Base de datos: Firebase Realtime Database
- Operaciones criticas: `src/firebase/ops.js`
- Lecturas auxiliares: `src/firebase/database.js`

Decision importante del diseño:
- la logica critica vive en el frontend
- las operaciones escriben multipath updates y transacciones directamente sobre RTDB

## 2. Roles

Nodo principal:
- `usuarios/{uid}`

Roles usados:
- `admin`
- `personal`
- `cliente`

Campos relevantes:
- `rol`
- `sucursalId`
- `sucursalNombre`

Resumen funcional:
- `admin`: opera catalogo, sucursales, personal, inventario, transferencias y reportes
- `personal`: opera ventas y transferencias sobre su sucursal; inventario queda en consulta
- `cliente`: no usa el dashboard operativo

## 3. Fuentes de verdad

### 3.1 Productos

Nodo principal:
- `productos/{productoId}`

Contiene:
- marca
- modelo
- nombre
- codigo
- precio
- urlImagen
- campos normalizados:
  - `marcaLower`
  - `modeloLower`
  - `nombreLower`
  - `codigoLower`

Indice auxiliar:
- `productosPorMarca/{marcaLower}/{productoId} = true`

Importante:
- hoy ese indice se sigue manteniendo en escritura, pero la app no lo usa para leer
- las busquedas reales se hacen directamente sobre `productos` usando `marcaLower`, `modeloLower`, `nombreLower` y `codigoLower`

Conclusion tecnica:
- `productos` es la fuente real
- `productosPorMarca` es un indice legado o redundante en el estado actual

## 3.2 Inventario actual

Stock por talla:
- `inventario/{sucursalId}/{productoId}/tallas/{talla}`

Totales por producto:
- `inventarioTotales/{sucursalId}/{productoId}`

Estos nodos representan la foto viva del inventario.

## 3.3 Lotes y costo FIFO

Lotes:
- `lotesCompra/{sucursalId}/{productoId}/{talla}/{loteId}`

Indice de lotes con saldo:
- `lotesCompraActivos/{sucursalId}/{productoId}/{talla}/{loteId} = creadoEn`

Cada lote puede tener origen identificado por:
- `sourceType`
- `sourceId`
- `sourceMovimientoId`

Orígenes actuales:
- `compra`
- `regularizacion`
- `transferencia_entrada`

## 3.4 Trazabilidad por lote

Nodo nuevo relevante:
- `movimientosPorLote/{sucursalId}/{productoId}/{talla}/{loteId}/{traceId}`

Este nodo guarda trazas de entrada y salida por lote.

Tipos que hoy registra el sistema:
- entrada por compra
- entrada por regularizacion
- entrada por transferencia
- salida por venta
- salida por merma
- salida por transferencia
- reverso por anulacion de venta

Esto resuelve una limitacion anterior:
- antes se inferia el consumo de un lote solo con `cantidadInicial - cantidadDisponible`
- ahora existe trazabilidad explicita del origen y consumo del lote

## 3.5 Ventas

Nodo principal:
- `ventas/{ventaId}`

Indices auxiliares:
- `ventasPorSucursal/{sucursalId}/{ventaId}`
- `reportes/ventasPorSucursalDia/{sucursalId}/{yyyymmdd}`

La venta guarda:
- items
- total
- metodoPago
- costoTotal
- margenBruto
- `consumoLotes`
- `costoIncompleto` cuando no se pudo determinar costo completo

## 3.6 Compras

Nodo principal:
- `compras/{compraId}`

Indice:
- `comprasPorSucursal/{sucursalId}/{compraId}`

Sirve como historial de reposiciones cargadas desde Inventario.

## 3.7 Movimientos de inventario

Nodo principal:
- `movimientosInventario/{movId}`

Indice:
- `movimientosPorSucursal/{sucursalId}/{movId}`

Tipos usados actualmente:
- `compra`
- `venta_salida`
- `merma`
- `regularizacion`
- `transferencia_salida`
- `transferencia_entrada`
- `transferencia_anulada`
- otros ajustes segun operacion

## 3.8 Transferencias

Nodo principal:
- `transferencias/{transferenciaId}`

Estados:
- `pendiente`
- `transferido`
- `anulada`

## 4. Invariantes de consistencia

Estas reglas resumen la logica del sistema:

1. El inventario no debe editarse manualmente.
2. Todo cambio de stock debe pasar por una operacion auditable.
3. Las salidas con impacto de costo consumen lotes FIFO.
4. Las entradas que deben participar en FIFO futuro crean lotes.
5. Las anulaciones no borran historia; hacen reversos auditables.
6. El reporte historico y el stock actual no son lo mismo.

Interpretacion:
- historico = movimientos ocurridos en un rango
- stock actual = foto viva actual desde `inventario` e `inventarioTotales`

## 5. Flujos operativos principales

## 5.1 Catalogo

UI:
- `src/features/products/ProductsPage.jsx`
- `src/app/(with-auth)/Servicios/Agregar/page.jsx`

Operacion:
- `guardarProducto()`
- `eliminarProducto()`

`guardarProducto()` hace:
- normaliza texto
- recalcula `marcaLower`, `modeloLower`, `nombreLower`, `codigoLower`
- escribe `productos/{id}`
- mantiene `productosPorMarca`

`eliminarProducto()` hace:
- borra `productos/{id}`
- borra su entrada en `productosPorMarca`

Riesgo actual:
- `productosPorMarca` solo es consistente si toda escritura de productos pasa por estas funciones

## 5.2 Compra / reposicion

UI:
- `src/features/inventory/InventoryPage.jsx` en modo `compra`

Operacion:
- `registrarCompraInventarioProductoSucursal()`

Efectos:
- incrementa `inventario`
- actualiza `inventarioTotales`
- crea lotes en `lotesCompra`
- agrega lotes activos en `lotesCompraActivos`
- registra compra en `compras` y `comprasPorSucursal`
- registra movimiento de inventario
- registra trazabilidad por lote con `sourceType: 'compra'`

Correccion:
- existe `anularReposicionCompra()`
- solo aplica cuando el lote sigue intacto y no ha sido consumido

## 5.3 Venta

UI:
- `src/app/(with-auth)/RegistrarVenta/page.jsx`

Operacion:
- `registrarVenta()`

Efectos:
- valida stock actual
- consume lotes FIFO
- descuenta `inventario`
- actualiza `inventarioTotales`
- guarda venta en `ventas`
- escribe `ventasPorSucursal`
- actualiza `reportes/ventasPorSucursalDia`
- registra movimiento `venta_salida`
- registra trazabilidad por lote en `movimientosPorLote`

Cambio importante respecto a versiones anteriores:
- `Registrar venta` ya no solicita transferencias
- hoy solo registra ventas

Correccion:
- `anularVenta()`

Efecto de anular:
- devuelve stock
- revierte consumo FIFO
- ajusta vistas e historicos relacionados
- agrega traza de reverso por lote

## 5.4 Merma

UI:
- `src/features/inventory/InventoryPage.jsx` en modo `merma`

Operacion:
- `registrarMermaInventarioProductoSucursal()`

Efectos:
- consume lotes FIFO
- descuenta inventario
- actualiza totales
- registra movimiento tipo `merma`
- registra `consumoLotes`
- registra salidas por lote en `movimientosPorLote`

Interpretacion de negocio:
- merma es salida de stock sin ingreso
- no debe tratarse como venta

## 5.5 Regularizacion

UI:
- `src/features/inventory/InventoryPage.jsx` en modo `regularizacion`

Operacion:
- `registrarRegularizacionInventarioProductoSucursal()`

Efectos:
- incrementa inventario
- actualiza totales
- crea lotes con `sourceType: 'regularizacion'`
- registra movimiento tipo `regularizacion`
- registra entrada por lote en `movimientosPorLote`

Nota:
- si el costo no se informa, puede aparecer como costo desconocido en reportes

## 5.6 Transferencias

UI:
- `src/app/(with-auth)/Transferencias/page.jsx`

Operaciones:
- `solicitarTransferencia()`
- `transferirTransferencia()`
- `anularTransferencia()`

Modelo:
- la solicitud crea una transferencia `pendiente`
- confirmar la transferencia mueve stock
- anular la deja en `anulada` sin mover stock

Permisos funcionales actuales en UI:
- `admin`: puede solicitar, transferir y anular cualquier pendiente
- `personal`:
  - crea solicitudes con `origen = otra sucursal` y `destino = su sucursal`
  - solo puede confirmar o anular pendientes cuyo `desdeSucursalId` coincide con su sucursal

Esto significa:
- la pantalla de `Transferencias` es el unico punto de solicitud
- `Registrar venta` ya no participa en ese flujo

Efectos de `transferirTransferencia()`:
- consume FIFO en origen
- descuenta stock en origen
- crea stock en destino
- crea lotes de entrada en destino con `sourceType: 'transferencia_entrada'`
- registra movimientos:
  - `transferencia_salida`
  - `transferencia_entrada`
- registra trazas por lote en origen y destino

Efectos de `anularTransferencia()`:
- solo cambia estado y metadata de anulacion
- no mueve stock

## 6. Reportes

UI:
- `src/features/reports/ReportsPage.jsx`

## 6.1 Vista principal

La vista principal muestra un resumen por sucursal con estas columnas:
- `Ventas`
- `Reposiciones`
- `Ajustes`
- `Transferencias`
- `Stock actual`
- `Accion`

Esto reemplaza el esquema viejo donde `Inventario` mezclaba demasiados conceptos.

## 6.2 Detalle por sucursal

Tabs actuales:
- `ventas`
- `compras`
- `ajustes`
- `transferencias`
- `stock`

Etiquetas visibles:
- `Ventas`
- `Reposiciones`
- `Ajustes`
- `Transferencias`
- `Stock actual`

## 6.3 Fuentes usadas por reporte

Ventas:
- `reportes/ventasPorSucursalDia`
- `ventasPorSucursal`
- `ventas/{ventaId}`

Reposiciones:
- `comprasPorSucursal`
- `compras/{compraId}`
- `movimientosPorLote` para desglosar consumo del lote por tipo

Ajustes:
- `movimientosPorSucursal`
- `movimientosInventario/{movId}`

Transferencias:
- `movimientosPorSucursal`
- `movimientosInventario/{movId}`
- `transferencias/{transferenciaId}` cuando hace falta enriquecer detalle

Stock actual:
- `inventarioTotales/{sucursalId}`
- `inventario/{sucursalId}/{productoId}/tallas`

## 6.4 Diferencia importante: historico vs stock actual

El reporte mezcla dos capas distintas y eso es intencional:

- `Ventas`, `Reposiciones`, `Ajustes`, `Transferencias`
  - dependen del rango de fechas
  - son historicos

- `Stock actual`
  - no depende del rango
  - es una foto viva del inventario actual

Esto es clave para no interpretar mal los numeros.

## 6.5 Exportacion

El detalle puede exportar hojas separadas para:
- Ventas
- Reposiciones
- Ajustes
- Transferencias
- Stock actual

## 7. Idempotencia

Nodo:
- `idempotencias/{key}`

Se usa para reducir duplicados por doble click o mala red.

Operaciones donde importa especialmente:
- venta
- anulacion de venta
- solicitud de transferencia
- confirmacion de transferencia
- anulacion de transferencia

## 8. Estado actual de la consistencia tecnica

## 8.1 Puntos fuertes

- inventario actual y costo FIFO estan bien separados
- ventas, mermas y transferencias registran consumo por lote
- regularizaciones ya crean lotes auditables
- transferencias tienen historial y estados claros
- reportes ya distinguen `Ajustes` y `Stock actual`

## 8.2 Limitaciones reales

- la logica critica sigue viviendo en frontend
- el sistema depende de que todas las escrituras usen `ops.js`
- `productosPorMarca` se mantiene, pero no se usa en lectura
- datos viejos pueden no tener trazabilidad completa por lote
- por eso algunos historicos antiguos pueden caer en categorias tipo `Sin costo` o `Sin traza`

## 8.3 Implicacion para desarrollo futuro

Si se agregan nuevas operaciones:
- deben actualizar inventario
- deben actualizar lotes si afectan costo futuro
- deben registrar movimiento de inventario
- idealmente deben registrar `movimientosPorLote`

Si se agregan nuevas pantallas de catalogo:
- o se sigue usando `productos` como fuente unica de busqueda
- o se decide formalmente usar/eliminar `productosPorMarca`

## 9. Checklist tecnico actualizado

Datos:
- [ ] Ninguna pantalla escribe stock directo fuera de `ops.js`
- [ ] Compra, venta, merma, regularizacion y transferencia dejan rastro auditable
- [ ] Las entradas que deben costear futuro crean lotes
- [ ] Las salidas con costo registran consumo FIFO y trazabilidad por lote

Reportes:
- [ ] `Reposiciones` se interpreta como compras
- [ ] `Ajustes` se interpreta como mermas + regularizaciones
- [ ] `Stock actual` se interpreta como foto viva
- [ ] Transferencias se revisan separadas de ventas y ajustes

Producto:
- [ ] Toda escritura de productos pasa por `guardarProducto()`
- [ ] Si `productosPorMarca` no se va a usar, conviene retirarlo del diseño

Operaciones:
- [ ] `Registrar venta` se mantiene enfocado solo en ventas
- [ ] `Transferencias` sigue siendo el unico punto de solicitud
- [ ] Reversos se hacen con anulaciones, no borrando datos
