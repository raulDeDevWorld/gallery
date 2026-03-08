'use client'
import { useUser } from '@/context'
import { getValue } from '@/firebase/database'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation'
export default function layout({ children }) {
  const { user, userDB, setUserData } = useUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!user) return
    if (userDB === undefined) return

    if (userDB === null) {
      let cancelled = false

      ;(async () => {
        const fresh = await getValue(`usuarios/${user.uid}`).catch(() => null)
        if (cancelled) return

        if (fresh) {
          setUserData(fresh)
          return
        }

        if (pathname !== '/Register') router.replace('/Register')
      })()

      return () => {
        cancelled = true
      }
    }

    if (pathname !== '/') {
      router.replace('/')
      return
    }

    return () => {
      // no-op
    }
  }, [user, userDB, router, pathname, setUserData])
  return (
    <main className='relative min-h-screen w-full flex flex-col items-center justify-center text-text px-4 py-10'>
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url(/bg.jpg)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/65 to-black/90" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_55%)]" />

      <div className='relative z-10 w-full flex justify-center pb-5'>
        <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 backdrop-blur px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <img src="/logo.png" className='h-[54px] w-auto object-contain' alt="Logo" />
          <div className="text-left leading-tight">
            <div className="text-[14px] font-semibold text-white">Tienda Zapatos</div>
            <div className="text-[12px] text-white/70">Acceso al panel</div>
          </div>
        </div>
      </div>

      <div className='relative z-10 w-full flex justify-center'>
        {children}
      </div>
    </main>
  )
}



