export const ROLES = Object.freeze({
  admin: 'admin',
  personal: 'personal',
  cliente: 'cliente',
})

export const ROLE_LABELS = Object.freeze({
  [ROLES.admin]: 'Administrador',
  [ROLES.personal]: 'Personal',
  [ROLES.cliente]: 'Cliente',
})

export function isCanonicalRol(value) {
  const rol = String(value ?? '').trim().toLowerCase()
  return rol === ROLES.admin || rol === ROLES.personal || rol === ROLES.cliente
}

export function normalizeRol(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  return raw
}

export function canonicalRol(value, fallback = '') {
  const rol = normalizeRol(value)
  if (isCanonicalRol(rol)) return rol
  return fallback
}

export function getRol(userOrRol) {
  if (typeof userOrRol === 'string') return normalizeRol(userOrRol)
  return normalizeRol(userOrRol?.rol)
}

export function isAdmin(userOrRol) {
  return getRol(userOrRol) === ROLES.admin
}

export function isCliente(userOrRol) {
  return getRol(userOrRol) === ROLES.cliente
}

export function isPersonal(userOrRol) {
  return getRol(userOrRol) === ROLES.personal
}

export function rolLabel(userOrRol) {
  const rol = getRol(userOrRol)
  if (!rol) return 'Usuario'
  return ROLE_LABELS[rol] ?? rol
}

export function canEditarProductos(userOrRol) {
  return isAdmin(userOrRol)
}

export function canEditarSucursales(userOrRol) {
  return isAdmin(userOrRol)
}

export function canEditarPersonal(userOrRol) {
  return isAdmin(userOrRol)
}

export function canVerReportesHistoricos(userOrRol) {
  return isAdmin(userOrRol)
}
