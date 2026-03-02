'use client'

import Button from '@/components/Button'
import Modal from '@/components/Modal'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import Select from '@/components/Select'
import { useUser } from '@/context/'
import { useEffect, useState } from 'react'
import { writeUserData, removeData, readUserData } from '@/firebase/database'
import { roles } from '@/constants'
import { usePagination } from '@/hooks/usePagination'
import TablePager from '@/components/TablePager'
import { isAdmin, canonicalRol, normalizeRol, ROLES } from '@/lib/roles'


function ClientsPage() {
    const { userDB, msg, modal, setModal, setUserItem, item, sucursales, setSucursales, setClientes, clientes } = useUser()
    const [state, setState] = useState({})
    const [filter, setFilter] = useState('')
    const admin = isAdmin(userDB)


    function onChangeHandler(e) {
        setFilter(String(e.target.value || '').toLowerCase())
    }
    const onClickHandlerSelect = (name, value, uuid) => {
        setState({ ...state, [uuid]: { ...state[uuid], [name]: value } })
    }  

    const onClickHandlerSelect2 = (name, value, uuid) => {
        if (!sucursales) return
        const res = Object.values(sucursales).find((i)=> i.nombre === value)
        if (!res) return
        setState({ ...state, [uuid]: { ...state[uuid], [name]: value, sucursalId: res.uuid, sucursalNombre: res.nombre } })
    }  
    async function save(i) {
        const uid = i.uid || i.uuid
        const now = Date.now()
        const patch = { ...(state[uid] || {}), updatedAt: now }

        if (patch.rol != null) patch.rol = canonicalRol(patch.rol, ROLES.cliente)
        const nextRol = canonicalRol(patch.rol ?? i.rol, ROLES.cliente)
        const nextSucursalId = patch.sucursalId ?? i.sucursalId
        if (i?.solicitudEstado === 'pendiente' && i?.rolSolicitado === 'personal' && nextRol !== ROLES.cliente && !!nextSucursalId) {
            patch.solicitudEstado = 'aprobado'
        }

        const res = await writeUserData(`usuarios/${uid}`, patch, () => { })
        const obj = { ...state }
        delete obj[uid]
        setState(obj)
        readUserData('usuarios', setClientes)
        if (res?.ok) setUserSuccess?.('Se ha guardado correctamente')
    }
    async function deletConfirm() {
        if (!item?.uid) return
        await removeData(`usuarios/${item.uid}`, setUserSuccess, () => {})
        readUserData('usuarios', setClientes)
    }
    function delet(i) {
        setUserItem(i)
        setModal('Delete')
    }
    function sortArray(x, y) {
        if (x['nombre'].toLowerCase() < y['nombre'].toLowerCase()) { return -1 }
        if (x['nombre'].toLowerCase() > y['nombre'].toLowerCase()) { return 1 }
        return 0
    }
    useEffect(() => {
        readUserData('usuarios', setClientes)
        readUserData('sucursales', setSucursales)
    }, [])

    const clientRows =
        clientes !== undefined && sucursales !== undefined
            ? Object.values(clientes)
                .sort(sortArray)
                .filter((u) => {
                    if (!u) return false
                    const isClient = normalizeRol(u.rol) === ROLES.cliente
                    const isUnassigned = !u.sucursalId || u.sucursalNombre === 'No asignado'
                    return isClient || isUnassigned
                })
                .filter((u) => String(u?.nombre || '').toLowerCase().includes(filter))
            : []

    const pagination = usePagination(clientRows, { initialPageSize: 10, resetOn: [filter] })

    return (

        <DataPanel
          title="Clientes"
          filter={{ value: filter, onChange: onChangeHandler, placeholder: 'Filtrar por nombre' }}
          scroll="x"
          footer={
            <TablePager
              page={pagination.page}
              pageCount={pagination.pageCount}
              total={pagination.total}
              from={pagination.from}
              to={pagination.to}
              pageSize={pagination.pageSize}
              pageSizeOptions={pagination.pageSizeOptions}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          }
        >
           {admin && modal === 'Delete' && <Modal funcion={deletConfirm}>Estas seguro de eliminar al siguiente usuario {msg}</Modal>}
                 <Table className="min-w-[1500px]">
                     <THead>
                         <tr>
                             <th scope="col" className="min-w-[50px] px-3 py-3">
                                 #
                             </th>
                            <th scope="col" className="px-3 py-3">
                                Nombre
                            </th>
                            <th scope="col" className="px-3 py-3">
                                CI
                            </th>
                            <th scope="col" className="px-3 py-3">
                                Dirección
                            </th>
                            
                            <th scope="col" className="px-3 py-3">
                                Whatsapp
                            </th>
                            <th scope="col" className="px-3 py-3">
                                Rol
                            </th>
                            <th scope="col" className="px-3 py-3">
                                Solicitud
                            </th>
                            <th scope="col" className="px-3 py-3">
                                Sucursal
                            </th>  
                             <th scope="col" className="px-3 py-3">
                                 Eliminar
                             </th>
                         </tr>
                     </THead>
                     <tbody>
                         {pagination.pageItems.map((i, index) => (
                            <tr className="text-[13px] border-b border-border/10 hover:bg-surface/40" key={i.uid || i.uuid || index}>
                                <td className="min-w-[50px] px-3 py-4  flex text-gray-900 align-middle">
                                   {pagination.from + index}
                                </td>
                                <td className="min-w-[200px] px-3 py-4 text-gray-900 ">
                                    {/* <textarea id="message" rows="1" onChange={(e) => onChangeHandler(e, i)} cols="6" name='nombre de producto 1' defaultValue={i['nombre de producto 1']} className="block p-1.5  w-full h-full text-sm text-gray-900 bg-white rounded-lg  focus:ring-gray-100 focus:border-gray-100 focus:outline-none resize-x-none" placeholder="Escribe aqui..."></textarea> */}
                                    {i['nombre']}
                                </td>
                                <td className="min-w-[150px]px-3 py-4 text-gray-900 ">
                                    {/* <textarea id="message" rows="1" onChange={(e) => onChangeHandler(e, i)} cols="6" name='nombre de producto 1' defaultValue={i['nombre de producto 1']} className="block p-1.5  w-full h-full text-sm text-gray-900 bg-white rounded-lg  focus:ring-gray-100 focus:border-gray-100 focus:outline-none resize-x-none" placeholder="Escribe aqui..."></textarea> */}
                                    {i['ci']}
                                </td>
                                <td className="min-w-[200px] px-3 py-4 text-gray-900 ">
                                    {/* <textarea id="message" rows="1" onChange={(e) => onChangeHandler(e, i)} cols="6" name='nombre de producto 1' defaultValue={i['nombre de producto 1']} className="block p-1.5  w-full h-full text-sm text-gray-900 bg-white rounded-lg  focus:ring-gray-100 focus:border-gray-100 focus:outline-none resize-x-none" placeholder="Escribe aqui..."></textarea> */}
                                    {i['direccion']}
                                </td>
                                <td className="min-w-[200px] px-3 py-4 text-gray-900 ">
                                    {/* <textarea id="message" rows="1" onChange={(e) => onChangeHandler(e, i)} name='costo' cols="4" defaultValue={i['costo']} className="block p-1.5 h-full text-sm text-gray-900 bg-white rounded-lg  focus:ring-gray-100 focus:border-gray-100 focus:outline-none resize-x-none" placeholder="Escribe aqui..."></textarea> */}
                                    {i['whatsapp']}
                                </td>
                                <td className="min-w-[200px] px-3 py-4 text-gray-900 " >
                                    {admin ? (
                                        <Select arr={roles} name='rol' uuid={i.uid} defaultValue={normalizeRol(i.rol)} click={onClickHandlerSelect} />
                                    ) : (
                                        <span className="text-text font-semibold">{normalizeRol(i.rol) || '—'}</span>
                                    )}
                                </td>
                                <td className="min-w-[200px] px-3 py-4 text-gray-900 ">
                                    {i?.solicitudEstado === 'pendiente' && i?.rolSolicitado === 'personal'
                                        ? <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-3 py-1 text-[12px] font-medium">
                                            Solicita personal
                                        </span>
                                        : <span className="text-[12px] text-gray-400">-</span>
                                    }
                                </td>
                                <td className="min-w-[200px] px-3 py-4 text-gray-900 " >
                                    {admin ? (
                                        <Select arr={Object.values(sucursales).map((i) => i.nombre)} name='sucursalNombre' uuid={i.uid}  defaultValue={i.sucursalNombre ? i.sucursalNombre : 'No asignado'} click={onClickHandlerSelect2} />
                                    ) : (
                                        <span className="text-text font-semibold">{i.sucursalNombre || 'No asignado'}</span>
                                    )}
                                </td>
                                <td className="px-3 py-4">
                                    {admin ? (
                                        state[i.uid]
                                            ? <Button theme={"Primary"} click={() => save(i)}>Guardar</Button>
                                            : <Button theme={"Danger"} click={() => delet(i)}>Eliminar</Button>
                                    ) : (
                                        <span className="text-muted">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                     </tbody>
                 </Table>
{/* 
                <div className='lg:flex hidden lg:fixed top-[100px] right-[65px] '>
                    <div className='flex justify-center items-center h-[50px] text-white text-[14px] font-bold bg-black border border-gray-200 rounded-[10px] px-10 cursor-pointer mr-2' onClick={redirect}>Agregar Sucursal</div>
                    <div className='flex justify-center items-center bg-black h-[50px] w-[50px]  rounded-full text-white cursor-pointer' onClick={redirect}> <span className='text-white text-[30px]'>+</span> </div>
                </div> */}
        </DataPanel>

    )
}


export default ClientsPage





