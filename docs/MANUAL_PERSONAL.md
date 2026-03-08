# Manual de Uso (Personal de Sucursal)

Fecha: 2026-03-06

Este manual es para el rol `personal` (trabajo diario). Explica como operar sin "romper" inventario ni reportes.

Regla principal:
- NO se edita stock a mano. Todo cambio se registra como evento: Compra, Venta, Merma, Regularizacion o Transferencia.

## 1) Ingreso al sistema

1) Inicia sesion.
2) Si el sistema te pide completar registro, llena los datos solicitados.
3) Verifica que tu usuario tenga una sucursal asignada (lo hace un admin).

Si no ves nada o no puedes operar:
- Revisa que tu rol sea `personal` y que exista `sucursalId` en tu perfil.

## 2) Catalogo (solo consulta)

Ruta: Catalogo / Productos

Para buscar:
- Usa busqueda por Marca / Modelo / Nombre / Codigo.
- Selecciona el producto para ver informacion.

Nota:
- El personal normalmente no edita catalogo (eso es para admin).

## 3) Inventario (stock por talla + registrar eventos)

Ruta: Inventario

Como ver stock:
1) Busca el producto.
2) Abre el detalle del producto.
3) Selecciona la sucursal.
4) En "Stock por talla (sucursal)" veras las tallas con su cantidad (solo lectura).

Dentro del detalle hay 3 modos:

### A) Compra (lotes) - Para ingresar stock comprado

Cuando usarlo:
- Llego mercaderia (reposicion).

Pasos:
1) Selecciona "Compra (lotes)".
2) Llena Proveedor (opcional) y Nota (opcional).
3) Para cada talla, ingresa:
   - Talla
   - Cantidad
   - Costo unitario
4) Confirma.

Que hace el sistema:
- Suma al inventario.
- Crea lotes por talla (costo FIFO).
- Deja rastro en reportes.

Errores comunes:
- Si te equivocas en costo/tallas, no borres nada: avisa al admin.
  - Existe "Anular reposicion" solo si ningun lote se consumio (cuando esta "nuevo").

### B) Merma - Para stock perdido/roto/faltante

Cuando usarlo:
- Producto roto, extravio, merma real.

Pasos:
1) Selecciona "Merma".
2) Elige motivo (ej: roto, perdido, etc).
3) Ingresa tallas y cantidades a descontar.
4) Confirma.

Que hace el sistema:
- Descuenta inventario.
- Calcula costo consumiendo lotes FIFO (si hay lotes).
- Aparece en reportes como merma (no como venta).

### C) Regularizacion - Para correcciones de conteo (entrada)

Cuando usarlo:
- Aparecio stock que no estaba registrado.
- Ajuste por conteo (entrada).

Pasos:
1) Selecciona "Regularizacion".
2) Elige motivo y nota.
3) Ingresa tallas y cantidades.
4) Si conoces el costo, ingresalo. Si no, dejalo vacio.
5) Confirma.

Que hace el sistema:
- Suma inventario.
- Crea lotes tipo "regularizacion" para mantener FIFO.
- Si no hay costo, se marca como costo desconocido (puede salir como "Sin costo" en algunos reportes).

## 4) Registrar venta (salida de stock)

Ruta: Registrar venta

Pasos:
1) Busca el producto (la tarjeta muestra stock por talla).
2) En la talla, usa + / - para agregar cantidades.
3) Ajusta precio si corresponde (si la UI lo permite).
4) Elige metodo de pago (ej: QR).
5) Confirma venta.

Que hace el sistema:
- Descuenta inventario.
- Consume lotes FIFO (costo real).
- Guarda consumo por lotes para auditoria.
- Actualiza reportes diarios.

Si fue un error:
- No se borra. Se usa "Anular venta" (reverso auditable) para devolver stock y corregir reportes.

## 5) Transferencias (mover stock entre sucursales)

Ruta: Transferencias

Regla de roles (personal):
- La sucursal ORIGEN solo puede SOLICITAR (crear pendiente).
- La sucursal DESTINO puede:
  - Marcar como transferido (confirma y mueve stock).
  - Anular (si esta pendiente).

### A) Solicitar transferencia (origen)

Pasos:
1) Selecciona sucursal Origen y Destino.
2) Busca productos.
3) Agrega cantidades por talla (se ve stock origen).
4) Guarda solicitud.

Resultado:
- Queda en estado "pendiente".
- No mueve stock aun.

### B) Confirmar transferencia (destino)

Pasos:
1) En historial "Pendientes", ubica la transferencia.
2) Pulsa "Marcar transferido".

Resultado:
- Se descuenta stock en origen.
- Se suma stock en destino.
- El costo se calcula por FIFO en origen.
- Queda rastro de movimientos.

### C) Anular transferencia (destino)

Cuando usarlo:
- Solicitud equivocada, duplicada, o no se puede recibir.

Pasos:
1) En historial "Pendientes", pulsa "Anular".

Resultado:
- Pasa a "anulada".
- No mueve stock.

## 6) Reporte historico (consulta)

Ruta: Reportes

En la vista inicial:
- Veras resumen por sucursal:
  - Ventas (recaudado, costo, margen)
  - Reposiciones (compras, inversion)
  - Inventario (mermas, regularizaciones)
  - Transferencias (entradas/salidas)

Para ver detalle:
1) Pulsa "Ver" en una sucursal.
2) Usa tabs (Ventas, Reposiciones, Inventario, Transferencias).
3) En Ventas/Reposiciones puedes expandir filas para ver lotes consumidos o estado del lote.

## 7) Buenas practicas (para que cuadre el sistema)

- Compra: siempre poner costo unitario correcto.
- Merma: usarlo solo para perdida real.
- Regularizacion: usarlo para entradas por conteo (y anotar motivo).
- Si cometes un error: prefiere "Anular" antes que duplicar registros.
- No compartas usuario/clave entre personal.

## 8) Solucion de problemas rapida

- "No puedo marcar transferido":
  - Probable causa: no eres sucursal destino o no tienes sucursal asignada.
- "No puedo ver mi sucursal":
  - Probable causa: falta `sucursalId` en tu usuario.
- "Sale Sin costo":
  - Probable causa: stock viejo sin lotes, o regularizacion con costo desconocido.

