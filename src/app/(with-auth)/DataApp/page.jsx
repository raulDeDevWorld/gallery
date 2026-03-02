'use client'

import { writeUserData, readUserData } from '@/firebase/database'
import { uploadStorage } from '@/firebase/storage'
import { useState, useEffect } from 'react'
import { useUser } from '@/context'
import Input from '@/components/Input'
import Select from '@/components/Select'
import Label from '@/components/Label'
import LoaderBlack from '@/components/LoaderBlack'
import Button from '@/components/Button'
import { useMask, format } from '@react-input/mask';
import { useRouter } from 'next/navigation';



function Home() {
    const { user, userDB, setUserData, success, setUserSuccess, perfil, setPerfil, modal, setModal, } = useUser()
    const router = useRouter()
    const [state, setState] = useState({})
    const [postImage, setPostImage] = useState(null)
    const [urlPostImage, setUrlPostImage] = useState(null)
    const [disable, setDisable] = useState(false)
    const whatsappMask = { mask: '+ 591 __ ___ ___', replacement: { _: /\d/ } }
    const inputRefWhatsApp = useMask(whatsappMask);

    const whatsappDefaultValue =
        perfil && typeof perfil.whatsapp === 'string'
            ? (perfil.whatsapp.includes('+') ? perfil.whatsapp : format(perfil.whatsapp, whatsappMask))
            : ''

    function onChangeHandler(e) {
        setState({ ...state, [e.target.name]: e.target.value })
    }

    async function save(e) {
        e.preventDefault()
        setModal('Guardando')
        const data = {
            whatsapp: e.target[1].value,
            categoria: e.target[2].value.replaceAll(' ', '').split(','),
            ['recepcion por']: e.target[3].value.replaceAll(' ', '').split(','),
        }       
        const callback = () => {
            setModal('')
        }
        if (postImage === null || postImage === undefined) {
            writeUserData(`perfil/`, data, setPerfil, setUserSuccess, callback)
            return
        }

        uploadStorage(`perfil/`, postImage, data, callback, setPerfil, setUserSuccess)
    }
    console.log(postImage)
    function manageInputIMG(e) {
        const file = e.target.files[0]
        setPostImage(file)
        setUrlPostImage(URL.createObjectURL(file))
    }
    return (
        user && <div className='w-full flex justify-center px-4 lg:px-8 py-6'>
 
            <form className='w-full max-w-[900px] rounded-3xl bg-surface/40 p-6 lg:p-10 shadow-sm ring-1 ring-border/20 backdrop-blur' onSubmit={save} >
                {modal === "Guardando" && <LoaderBlack>{modal}</LoaderBlack>}
                {disable && <LoaderBlack></LoaderBlack>}
                <h3 className='text-center text-[16px] pb-3 font-bold'>Datos Empresariales</h3>
                <br />
                <div className="min-w-full flex justify-center ">
                    <label htmlFor="fileUpload" className="mt-2 flex justify-center items-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10 md:w-[250px] md:h-[200px]" style={{ backgroundImage: `url(${urlPostImage === null && perfil ? perfil['url'] : urlPostImage })`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}>
                        <div className="text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                            </svg>
                            <div className="mt-4 flex text-sm leading-6 text-gray-600">
                                <label htmlFor="fileUpload" className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500">
                                    <span>Cargar Imagen QR</span>
                                    <input id="fileUpload" name="frontPage" onChange={manageInputIMG} type="file" className="sr-only" accept="image/*"  />
                                </label>
                                <p className="pl-1">{' '} puede ser:</p>
                            </div>
                            <p className="text-xs leading-5 text-gray-600">PNG, JPG, max 10MB</p>
                        </div>
                    </label>
                </div>
                <div className="grid gap-6 mb-6 md:grid-cols-2">
                    <div>
                        <Label htmlFor="">Whatsapp</Label>
                        <Input type="text" name="whatsapp" onChange={onChangeHandler} reference={inputRefWhatsApp} defValue={whatsappDefaultValue} require />
                    </div>
                    <div>
                        <Label htmlFor="">Categoria</Label>
                        <Input type="text" name="categoria" onChange={onChangeHandler}  defValue={perfil && perfil['categoria'] !== undefined && perfil['categoria'].length > 0 ? perfil['categoria'].toString().replaceAll('"', '').replaceAll('[', '').replaceAll('"', '').replaceAll(']', '').replaceAll(',', ', ') : ''} require />
                    </div>
                    <div>
                        <Label htmlFor="">Categoria 2</Label>
                        <Input type="text" name="recepcion por" onChange={onChangeHandler}  defValue={perfil && perfil['recepcion por'] !== undefined && perfil['recepcion por'].length > 0 ? perfil['recepcion por'].toString().replaceAll('"', '').replaceAll('[', '').replaceAll('"', '').replaceAll(']', '').replaceAll(',', ', ') : ''} require />
                    </div>
                </div>
                <br />
                <br />
                <div className='flex w-full justify-around'>
                    <Button type="submit" theme='Primary'>Guardar</Button>
                </div>
            </form>
        </div>
    )
}

export default Home
