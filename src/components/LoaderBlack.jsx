'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function LoaderContent({ children }) {
    return (
        <div className="fixed inset-0 z-[99999] flex min-h-screen items-center justify-center bg-black/70 px-4">
            <div aria-label="Cargando" role="status" className="flex items-center space-x-2 rounded-3xl bg-black/60 px-6 py-4 shadow-2xl backdrop-blur">
                <svg className="h-6 w-6 animate-spin stroke-white" viewBox="0 0 256 256">
                    <line x1="128" y1="32" x2="128" y2="64" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    <line x1="195.9" y1="60.1" x2="173.3" y2="82.7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    <line x1="224" y1="128" x2="192" y2="128" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    <line x1="195.9" y1="195.9" x2="173.3" y2="173.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    <line x1="128" y1="224" x2="128" y2="192" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    <line x1="60.1" y1="195.9" x2="82.7" y2="173.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    <line x1="32" y1="128" x2="64" y2="128" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                    <line x1="60.1" y1="60.1" x2="82.7" y2="82.7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                </svg>
                <span className="text-[14px] font-medium text-white">{children ? `${children}...` : 'Cargando...'}</span>
            </div>
        </div>
    )
}

export default function Loader({ children }) {
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

    return createPortal(<LoaderContent>{children}</LoaderContent>, portalRoot)
}
