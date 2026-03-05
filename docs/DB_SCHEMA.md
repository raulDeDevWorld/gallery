# Esquema de Base de Datos (Firebase RTDB)

Este documento describe la estructura de datos que estamos usando en Firebase Realtime Database (RTDB), el objetivo de cada nodo y la justificacion de por que existe.

Objetivos del diseno:
- Operacion diaria rapida: lecturas cortas para Inventario, Venta y Reportes.
- Costos reales por lotes (FIFO): el costo de compra se calcula automaticamente al confirmar una venta.
- Reportes/Excel como backup: el historico debe poder exportarse y luego permitir borrar datos sin perder lo importante.
- Compatibilidad: ventas viejas sin lotes siguen funcionando (se marcan como "Sin costo" si corresponde).

Convenciones:
- IDs: `sucursalId`, `productoId`, `ventaId`, `compraId` son strings (UUIDs).
- `talla` se guarda como string (ej: "37", "38", "40").
- Timestamps: `creadoEn`, `actualizadoEn`, `confirmadoEn` son milisegundos (Date.now()).

## Nodos principales

### `usuarios/{uid}`
Perfil del usuario, rol y (si aplica) sucursal asignada.
Uso: permisos y UX (admin/personal).

Ejemplo:
```json
{
  "rol": "admin",
  "sucursalId": "SUC_1",
  "sucursalNombre": "Central"
}
```

### `sucursales/{sucursalId}`
Metadatos de la sucursal (nombre, direccion, whatsapp, qrUrl, logoUrl, etc).

### `productos/{productoId}`
Catalogo global. Incluye precio referencial y campos lower para busqueda.

Ejemplo:
```json
{
  "marca": "ASICS",
  "modelo": "GEL RESOLUTION",
  "nombre": "NEGRO CON NARANJA",
  "precio": 905,
  "codigo": "A123",
  "marcaLower": "asics",
  "modeloLower": "gel resolution",
  "nombreLower": "negro con naranja",
  "codigoLower": "a123",
  "activo": true,
  "creadoEn": 1777777777777,
  "actualizadoEn": 1777777777777
}
```

### `productosPorMarca/{marcaLower}/{productoId} = true`
Indice auxiliar para agrupaciones por marca.

### `inventario/{sucursalId}/{productoId}/tallas/{talla} = number`
Estado actual del stock por sucursal y por talla.
Importante: aqui NO se guarda costo. Solo cantidades.

### `inventarioTotales/{sucursalId}/{productoId}`
Cache de total por producto/sucursal para evitar sumar tallas en cada render.

Ejemplo:
```json
{ "total": 25, "actualizadoEn": 1777777777777 }
```

## Lotes (costo de compra FIFO)

### `lotesCompra/{sucursalId}/{productoId}/{talla}/{loteId}`
Fuente de verdad del costo de compra por lotes. Cada reposicion crea un lote por talla.

Ejemplo:
```json
{
  "creadoEn": 1777777777777,
  "cantidadInicial": 10,
  "cantidadDisponible": 6,
  "costoUnitario": 680,
  "proveedor": "Mayorista X",
  "nota": "Reposicion marzo"
}
```

### `lotesCompraActivos/{sucursalId}/{productoId}/{talla}/{loteId} = creadoEn`
Indice liviano para consultar solo lotes con saldo (`cantidadDisponible > 0`) y consumir FIFO rapido.
Se borra del indice cuando el lote queda en 0.

Motivo: evita leer/recorrer miles de lotes historicos en cada venta.

## Compras (reposiciones)

### `compras/{compraId}`
Registro global/auditoria por id. Permite buscar una compra directamente por `compraId`.

Ejemplo:
```json
{
  "sucursalId": "SUC_1",
  "productoId": "PROD_1",
  "usuarioId": "UID_1",
  "creadoEn": 1777777777777,
  "proveedor": "Mayorista X",
  "nota": "Compra desde Inventario",
  "unidades": 5,
  "costoTotal": 3450,
  "marca": "ASICS",
  "modelo": "GEL RESOLUTION",
  "nombre": "NEGRO CON NARANJA",
  "items": {
    "PROD_1": {
      "tallas": {
        "37": { "cantidad": 2, "costoUnitario": 700 },
        "38": { "cantidad": 3, "costoUnitario": 680 }
      }
    }
  }
}
```

### `comprasPorSucursal/{sucursalId}/{compraId}`
Vista optimizada para reportes por sucursal y rango de fechas (indexada por `creadoEn`).
Incluye snapshot (producto + items) para que Reportes/Excel no haga lecturas extra.

## Ventas

### `ventas/{ventaId}`
Documento principal de la venta.
- `items`: agrupados por `productoId` con `tallas`.
- `preciosPorTalla`: precio real unitario usado en la venta (negociado o default del catalogo).
- `consumoLotes`: snapshot de lotes consumidos (FIFO) para costo exacto y reportes estables.
- `costoTotal` y `margenBruto`: calculados al confirmar.
- `costoIncompleto`: si hubo stock viejo sin lotes suficientes.

Ejemplo de un item:
```json
{
  "tallas": { "37": 1, "38": 1 },
  "preciosPorTalla": { "37": 905, "38": 850 },
  "consumoLotes": {
    "37": [{ "loteId": "L1", "cantidad": 1, "costoUnitario": 680 }],
    "38": [{ "loteId": "L2", "cantidad": 1, "costoUnitario": 700 }]
  }
}
```

### `ventasPorSucursal/{sucursalId}/{ventaId}`
Vista optimizada para listar ventas por rango temporal usando `orderByChild('creadoEn')`.
Incluye `total`, `costoTotal`, `margenBruto`, `estado`, `metodoPago`.

## Movimientos

### `movimientosInventario/{movimientoId}`
Auditoria operativa (ajustes, ventas_salida, compras, etc).
No es la fuente de costo FIFO (eso vive en lotes), pero es clave para trazabilidad.

## Reportes agregados

### `reportes/ventasPorSucursalDia/{sucursalId}/{yyyymmdd}`
Agregado diario por sucursal para dashboard rapido.
Campos: `total`, `costoTotal`, `margenBruto`, `cantidadVentas`, `actualizadoEn`, `ventas/{ventaId}=true`.

Motivo: evitar sumar/leer todas las ventas para ver totales del rango.

## Idempotencia y consistencia

### `idempotencias/{key}`
Candado para evitar duplicados por reintentos (ej: doble click, mala red).
Se usa en `registrarVenta` y puede extenderse a otras operaciones criticas.

## Flujos de negocio (resumen)

### Compra (reposicion por lotes)
1) Admin registra compra en Inventario: talla + cantidad + costoUnitario.
2) Se incrementa `inventario`.
3) Se crea lote en `lotesCompra` y se agrega a `lotesCompraActivos`.
4) Se guarda compra en `compras` y `comprasPorSucursal`.
5) (Opcional) se crea `movimientosInventario/compra_*`.

### Venta (consumo FIFO automatico)
1) Se arma carrito con precio default del catalogo (editable por item/talla).
2) Al confirmar: se consume FIFO desde `lotesCompraActivos`/`lotesCompra`.
3) Se descuenta `inventario`.
4) Se guarda en la venta `consumoLotes`, `costoTotal`, `margenBruto`.
5) Se actualiza `ventasPorSucursal` y `reportes/ventasPorSucursalDia`.

## Por que esta estructura es importante
- Permite margen real: costo por lotes + precio real por venta.
- Escala: indices (`inventarioTotales`, `ventasPorSucursal`, `reportes/*`, `lotesCompraActivos`) evitan lecturas masivas.
- Backup: Reportes y Excel pueden exportar Ventas + Reposiciones con suficiente informacion para borrar datos viejos sin perder historia.

