'use client'
import { useUser } from '@/context'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation'
export default function layout({ children }) {
  const { user, userDB } = useUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!user) return
    if (userDB === undefined) return

    if (userDB === null) {
      if (pathname !== '/Register') router.replace('/Register')
      return
    }

    router.replace('/')
  }, [user, userDB, router, pathname])
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

      {/* <div className='relative z-10 pt-8 sm:pt-0 sm:fixed sm:top-[40px] sm:left-[40px]'>
        <a type="button" href='#' download className="flex items-center justify-center w-48 text-white bg-white/10 rounded-xl h-14 border border-white/20 backdrop-blur hover:bg-white/15 transition-colors">
          <div className="mr-3">
            <svg viewBox="30 336.7 120.9 129.2" width="30">
              <path fill="#FFD400"
                d="M119.2,421.2c15.3-8.4,27-14.8,28-15.3c3.2-1.7,6.5-6.2,0-9.7  c-2.1-1.1-13.4-7.3-28-15.3l-20.1,20.2L119.2,421.2z">
              </path>
              <path fill="#FF3333"
                d="M99.1,401.1l-64.2,64.7c1.5,0.2,3.2-0.2,5.2-1.3  c4.2-2.3,48.8-26.7,79.1-43.3L99.1,401.1L99.1,401.1z">
              </path>
              <path fill="#48FF48" d="M99.1,401.1l20.1-20.2c0,0-74.6-40.7-79.1-43.1  c-1.7-1-3.6-1.3-5.3-1L99.1,401.1z">
              </path>
              <path fill="#3BCCFF"
                d="M99.1,401.1l-64.3-64.3c-2.6,0.6-4.8,2.9-4.8,7.6  c0,7.5,0,107.5,0,113.8c0,4.3,1.7,7.4,4.9,7.7L99.1,401.1z">
              </path>
            </svg>
          </div>
          <div>
            <div className="text-xs">
              Descargar
            </div>
            <div className="-mt-1 font-sans text-xl font-semibold">
              APK android
            </div>
          </div>
        </a>
      </div> */}

    </main>
  )
}




