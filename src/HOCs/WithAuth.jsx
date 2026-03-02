'use client'

import LoaderWithLogo from '@/components/LoaderWithLogo'
import { useUser } from '@/context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function WithAuth(Component) {
  function WithAuthWrapper(props) {
    const { user } = useUser()
    const router = useRouter()

    useEffect(() => {
      if (user === null) router.replace('/Login')
    }, [user, router])

    if (user === undefined) return <LoaderWithLogo />
    if (user === null) return null

    return <Component {...props} />
  }

  WithAuthWrapper.displayName = `WithAuth(${Component.displayName || Component.name || 'Component'})`
  return WithAuthWrapper
}
