'use client'
import { useUser } from '@/context'
import { signInWithEmail } from '@/firebase/utils'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import Input from '@/components/Input'


export default function Home() {
  const { setUserProfile, setUserSuccess } = useUser()
  const [isDisable, setIsDisable] = useState(false)
  const router = useRouter()

  const signInHandler = async (e) => {
    e.preventDefault()

    const form = e.currentTarget
    const email = form?.elements?.namedItem?.('email')?.value ?? ''
    const password = form?.elements?.namedItem?.('password')?.value ?? ''
    
    if (email.length == 0 || password.length == 0) {
      setUserSuccess('Complete')
      return setTimeout(() => { setIsDisable(false) }, 6000)
    }
    // if (email.length < 10 || password.length < 7) {
    //   setUserSuccess('PasswordMin')
    //   return setTimeout(() => { setIsDisable(false) }, 6000)
    // }
    signInWithEmail(email, password, setUserProfile, setUserSuccess, () => router.replace('/'))
  }

  return (
    <div className='w-full flex flex-col justify-center items-center'>
      <form
        className="w-full max-w-[440px] space-y-4 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.55)] px-6 py-8"
        onSubmit={!isDisable ? signInHandler : (e) => e.preventDefault()}
      >
        {/* <form className={`w-full max-w-[450px] space-y-4 border-[1px] border-white shadow-2xl shadow-white px-5 py-10`} onSubmit={!isDisable ? signInHandler : (e) => e.preventDefault()} > */}
        <div className="text-center">
          <h5 className="text-[22px] font-semibold text-white" >Iniciar sesión</h5>
          <p className="mt-1 text-[13px] text-white/70">Ingresa con tu email y contraseña</p>
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
          <Link href='/Restablecer' className="ml-auto text-[13px] text-white/70 hover:text-white underline underline-offset-4">Olvidaste tu contraseña?</Link>
        </div>
        <Button type="submit" theme="Primary">Iniciar sesión</Button>
        <div className="text-[13px] text-center text-white/80">
          No tienes una cuenta? <Link href="/SignUp" className="text-white underline underline-offset-4">Regístrate</Link>
        </div>
      </form>
    </div>
  )
}

