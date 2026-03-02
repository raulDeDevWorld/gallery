'use client'
import { useUser } from '@/context'
import { writeUserData } from '@/firebase/database'
import { handleSignOut as firebaseSignOut } from '@/firebase/utils'
import { useRouter } from 'next/navigation';

import { useState } from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { useMask } from '@react-input/mask';

export default function Home() {
    const { user, introVideo, setSound, userDB, setUserProfile, setUserSuccess, success, setUserData, postsIMG, setUserPostsIMG, sound1, sound2, setSound1, setSound2, } = useUser()
    const [isDisable, setIsDisable] = useState(false)
    const inputRefWhatsApp = useMask({ mask: '+ 591 __ ___ ___', replacement: { _: /\d/ } });
    const router = useRouter()
    const rolSolicitado = 'personal'

    const signInHandler = async (e) => {
        e.preventDefault()
        if (!user?.uid) return setUserSuccess('repeat')
        setIsDisable(true)
        const form = e.currentTarget
        const nombre = form?.elements?.namedItem?.('nombre')?.value ?? ''
        const ci = form?.elements?.namedItem?.('ci')?.value ?? ''
        const direccion = form?.elements?.namedItem?.('direccion')?.value ?? ''
        const whatsapp = form?.elements?.namedItem?.('whatsapp')?.value ?? ''

        if (!String(nombre).trim() || !String(ci).trim() || !String(direccion).trim() || !String(whatsapp).trim()) {
            setIsDisable(false)
            return setUserSuccess('Complete')
        }

        const now = Date.now()
        const data = {
            uid: user.uid,
            email: user.email || '',
            nombre: String(nombre).trim(),
            ci: String(ci).trim(),
            direccion: String(direccion).trim(),
            whatsapp: String(whatsapp).trim(),
            rol: 'cliente',
            rolSolicitado,
            solicitudEstado: 'pendiente',
            createdAt: now,
            updatedAt: now,
        }
        const res = await writeUserData(`/usuarios/${user.uid}`, data)
        if (!res?.ok) {
            setIsDisable(false)
            return setUserSuccess(res?.error?.code || res?.error?.message || 'repeat')
        }

        setUserSuccess('StaffRequestSent')
        router.replace('/')
    }
    const handleSignOut = () => {
        setUserProfile(null)
        firebaseSignOut()
    }

    return (
        <div className='w-full flex flex-col justify-center items-center'>
            <form className="w-full max-w-[720px] grid grid-cols-1 md:grid-cols-2 gap-4 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.55)] px-6 py-8" onSubmit={signInHandler} >
                <div className="text-center md:col-span-2">
                    <h5 className="text-[22px] font-semibold text-white" >Completa tu registro</h5>
                    <p className="mt-1 text-[13px] text-white/70">
                        Solicitud de acceso como <span className="font-medium text-white">Personal</span>. El admin te asignará sucursal y rol.
                    </p>
                </div>

                <div>
                    <label htmlFor="nombre" className="block mb-2 text-[14px] text-left font-medium text-white/90">Nombre</label>
                    <Input type="text" name="nombre" id="nombre" className="bg-gray-50 border border-gray-300 text-gray-900 text-[16px] rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-gray-800" placeholder="" require />
                </div>
                <div>
                    <label htmlFor="ci" className="block mb-2 text-[14px] text-left font-medium text-white/90">CI</label>
                    <Input type="text" name="ci" id="ci" className="bg-gray-50 border border-gray-300 text-gray-900 text-[16px] rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-gray-800" placeholder="" require />
                </div>
                <div>
                    <label htmlFor="direccion" className="block mb-2 text-[14px] text-left font-medium text-white/90">Dirección</label>
                    <Input type="text" name="direccion" id="direccion" className="bg-gray-50 border border-gray-300 text-gray-900 text-[16px] rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-gray-800" placeholder="" require />
                </div>
                <div>
                    <label htmlFor="whatsapp" className="block mb-2 text-[14px] text-left font-medium text-white/90">Whatsapp</label>
                    <Input type="text" name="whatsapp" id="whatsapp" className="bg-gray-50 border border-gray-300 text-gray-900 text-[16px] rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-gray-800" reference={inputRefWhatsApp} placeholder="" require />
                </div>
                <Button type="submit" theme={isDisable === false ? "Primary" : "Loading"} styled={"md:col-span-2"}>Enviar solicitud</Button>
                <div className="text-[13px] text-center text-white/80 md:col-span-2">
                    Ya tienes una cuenta? <Link href="/Login" className="text-white underline underline-offset-4" onClick={handleSignOut}>Inicia sesión</Link>
                </div>
            </form>
        </div>
    )
}
