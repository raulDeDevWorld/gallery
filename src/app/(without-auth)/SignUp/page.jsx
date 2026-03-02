'use client'
import { useUser } from '@/context'
import { onAuth, signUpWithEmail } from '@/firebase/utils'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import Input from '@/components/Input'
import LoaderBlack from '@/components/LoaderBlack'
import { useRouter } from 'next/navigation';

export default function Home() {
    const { user, introVideo, setSound, setIntroVideo, userDB, setUserProfile, setUserSuccess, success, setUserData, postsIMG, setUserPostsIMG, sound1, sound2, setSound1, setSound2, setModal, modal,  } = useUser()
    const [isDisable, setIsDisable] = useState(false)
    const router = useRouter()

    const signUpHandler = (e) => {
        e.preventDefault()
        setModal('Guardando')

        function callback(err) {
           if (err === true) {
             setModal('')
             return
           }

           router.push('/Register')
           setModal('')
        }

        const form = e.currentTarget
        const email = form?.elements?.namedItem?.('email')?.value ?? ''
        const password = form?.elements?.namedItem?.('password')?.value ?? ''

        if (email.length == 0 || password.length == 0) {
            setUserSuccess('Complete')
            return setTimeout(() => { setIsDisable(false) }, 6000)
        }
        if (email.length < 10 && password.length < 7) {
            setUserSuccess('PasswordMin')
            return setTimeout(() => { setIsDisable(false) }, 6000)
        }
        signUpWithEmail(email, password, setUserProfile, setUserSuccess, callback)
    }
    return (
        <div className='w-full flex flex-col justify-center items-center'>
            {modal === "Guardando" && <LoaderBlack>{modal}</LoaderBlack>}
            <form
                className="w-full max-w-[440px] space-y-4 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.55)] px-6 py-8"
                onSubmit={!isDisable ? signUpHandler : (e) => e.preventDefault()}
            >
                <div className="text-center">
                    <h5 className="text-[22px] font-semibold text-white">Crear cuenta</h5>
                    <p className="mt-1 text-[13px] text-white/70">Primero creamos tu usuario, luego completas tus datos</p>
                </div>

                <div>
                    <label htmlFor="email" className="block mb-2 text-[14px] text-left font-medium text-white/90">Email</label>
                    <Input type="email" name="email" id="email" className="bg-gray-50 border border-gray-300 text-gray-900 text-[16px] rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-gray-800" placeholder="name@company.com" require />
                </div>
                <div>
                    <label htmlFor="password" className="block mb-2 text-[14px] text-left font-medium text-white/90">Contraseña</label>
                    <Input type="password" name="password" id="password" placeholder="••••••••" className="bg-gray-50 border border-gray-300 text-gray-900 text-[16px] rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-gray-800" require />
                </div>
                <div className="flex items-start">
                    <Link href='/Resetear' className="ml-auto text-[13px] text-white/70 hover:text-white underline underline-offset-4">Olvidaste tu contraseña?</Link>
                </div>
                <Button type="submit" theme="Primary">Registrarme</Button>
                <div className="text-[13px] text-center text-white/80">
                    Ya tienes una cuenta? <Link href="/Login" className="text-white underline underline-offset-4">Inicia sesión</Link>
                </div>
            </form>
        </div>
    )
}

