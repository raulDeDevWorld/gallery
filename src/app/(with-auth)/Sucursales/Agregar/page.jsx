'use client'
import { writeUserData, readUserData } from '@/firebase/database'
import { useEffect, useRef, useState } from 'react'
import { useUser } from '@/context/'
import Input from '@/components/Input'
import Select from '@/components/Select'
import Label from '@/components/Label'
import LoaderBlack from '@/components/LoaderBlack'
import Loader from '@/components/Loader'

import Success from '@/components/Success'
import Checkbox from '@/components/Checkbox'
import Modal from '@/components/Modal'

import Button from '@/components/Button'
import { useMask } from '@react-input/mask';
import { useRouter } from 'next/navigation';
import { WithAuth } from '@/HOCs/WithAuth'
import { generateUUID } from '@/utils/UIDgenerator'
import { isAdmin } from '@/lib/roles'
// import { disponibilidad } from '@/constants'


function Home() {
    const router = useRouter()

    const { user, userDB, setUserData, setUserSuccess, success, setModal, modal, sucursales, setSucursales } = useUser()
    const [state, setState] = useState({})
    const [saving, setSaving] = useState(false)

    const admin = isAdmin(userDB)

    useEffect(() => {
        if (userDB === undefined) return
        if (!admin) {
            setUserSuccess?.('No tienes permisos')
            router.replace('/Sucursales')
        }
    }, [admin, router, setUserSuccess, userDB])

    const inputRefWhatsApp = useMask({ mask: '+ 591 __ ___ ___', replacement: { _: /\d/ } });

    const inputRef1 = useRef(null)
    const inputRef2 = useRef(null)

    function onChangeHandler(e) {
        setState({ ...state, [e.target.name]: e.target.value })
    }
    function handlerReset() {
        inputRef1.current && (inputRef1.current.value = '')
        inputRef2.current && (inputRef2.current.value = '')
        inputRefWhatsApp.current && (inputRefWhatsApp.current.value = '')
    }
    async function save(e) {
        e.preventDefault()
        const trimmed = {
            nombre: String(state.nombre ?? '').trim(),
            direccion: String(state.direccion ?? '').trim(),
            whatsapp: String(state.whatsapp ?? '').trim(),
        }

        if (!trimmed.nombre || !trimmed.direccion || !trimmed.whatsapp) {
            return setUserSuccess?.('Complete')
        }

        setSaving(true)
        setModal('Guardando')
        const uuid = generateUUID()

        try {
            await writeUserData(`sucursales/${uuid}`, { ...trimmed, uuid })
            handlerReset()
            setState({})
            setUserSuccess?.('Se ha guardado correctamente')
            router.push('/Sucursales')
        } catch (err) {
            setUserSuccess?.(err?.code || err?.message || 'repeat')
        } finally {
            setModal('')
            setSaving(false)
        }
    }
    console.log(state)

    return (
        <div className='min-h-full p-5 pb-[30px] lg:pb-5'>
          {modal === "Guardando" && <LoaderBlack>{modal}</LoaderBlack>}
            <form className='min-h-[80vh] w-full rounded-3xl bg-surface/40 p-6 lg:p-10 shadow-sm ring-1 ring-border/20 backdrop-blur' onSubmit={save}>
                <h3 className='text-center text-[16px] pb-3'>Agregar Sucursal</h3>
                {success == 'Se ha guardado correctamente' && <Success>Guardado correctamente</Success>}
                <br />
                <div className="flex flex-col md:grid md:gap-6 mb-6 md:grid-cols-2">
                    <div>
                        <Label htmlFor="">Nombre de Sucursal</Label>
                        <Input type="text" name="nombre" reference={inputRef1} onChange={onChangeHandler} require />
                    </div>
                    <div>
                        <Label htmlFor="">Direccion</Label>
                        <Input type="text" name="direccion" reference={inputRef2} onChange={onChangeHandler} require />
                    </div>
                    <div>
                        <Label htmlFor="">Whatsapp</Label>
                        <Input type="text" name="whatsapp" reference={inputRefWhatsApp} onChange={onChangeHandler} require />
                    </div>
                </div>
                <div className='flex w-full justify-around'>
                    {/* <Button theme='Success' >Ver Vista Cliente</Button> */}
                    <Button theme='Primary' type="submit" disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                </div>
                {success == 'Se ha guardado correctamente' && <LoaderBlack />}
                {modal == 'Seleccione una categoria.' && <Modal funcion={() => setUserSuccess('')} alert={true}>{modal}</Modal>}

            </form>
        </div>
    )
}


export default Home
