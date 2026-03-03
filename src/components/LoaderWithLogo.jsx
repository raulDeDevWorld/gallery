'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function LoaderWithLogoContent() {
    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-transparent px-4">
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-white/80 px-8 py-6 shadow-2xl backdrop-blur">
                <img src="/logo.png" className="h-[50px]" alt="Logo" />
                <div aria-label="Cargando" role="status" className="flex items-center space-x-2">
                    <svg className="h-6 w-6 animate-spin stroke-[#000000e4]" viewBox="0 0 256 256">
                        <line x1="128" y1="32" x2="128" y2="64" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                        <line x1="195.9" y1="60.1" x2="173.3" y2="82.7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                        <line x1="224" y1="128" x2="192" y2="128" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                        <line x1="195.9" y1="195.9" x2="173.3" y2="173.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                        <line x1="128" y1="224" x2="128" y2="192" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                        <line x1="60.1" y1="195.9" x2="82.7" y2="173.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                        <line x1="32" y1="128" x2="64" y2="128" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                        <line x1="60.1" y1="60.1" x2="82.7" y2="82.7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    </svg>
                    <span className="text-[16px] font-regular text-[#000000e4]">Cargando...</span>
                </div>
            </div>
        </div>
    )
}

export default function LoaderWithLogo() {
    const [portalRoot, setPortalRoot] = useState(null)

    useEffect(() => {
        const node = document.createElement('div')
        document.body.appendChild(node)
        setPortalRoot(node)
        return () => {
            document.body.removeChild(node)
        }
    }, [])

    if (!portalRoot) return null

    return createPortal(<LoaderWithLogoContent />, portalRoot)
}
