'use client'

import React, { useState, useMemo, useRef, useContext, useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { onAuth as firebaseOnAuth } from '@/firebase/utils'

const UserContext = React.createContext()

const THEMES = ['neutral', 'light', 'dark']
const ACCENTS = ['cyan', 'indigo', 'emerald', 'rose']

function resolveToastConfig(value) {
	if (value == null || value === '') return null

	const map = {
		// Auth
		'auth/user-not-found': { type: 'error', message: 'Cuenta inexistente' },
		'auth/wrong-password': { type: 'error', message: 'Contraseña incorrecta' },
		'auth/invalid-credential': { type: 'error', message: 'Email o contraseña incorrectos' },
		'auth/invalid-email': { type: 'error', message: 'Email inválido' },
		'auth/network-request-failed': { type: 'error', message: 'Error de red. Revisa tu conexión' },
		'auth/too-many-requests': { type: 'error', message: 'Demasiados intentos. Intenta más tarde' },
		LoginSuccess: { type: 'success', message: 'Sesión iniciada' },
		EmailVerificationSent: { type: 'info', message: 'Te enviamos un correo para verificar tu cuenta' },

		// App legacy keys
		PERMISSION_DENIED: { type: 'error', message: 'No tienes permisos para leer/escribir en la base de datos' },
		permission_denied: { type: 'error', message: 'No tienes permisos para leer/escribir en la base de datos' },
		AccountNonExist: { type: 'error', message: 'Cuenta inexistente' },
		CompleteEmail: { type: 'error', message: 'Introduce tu email' },
		Complete: { type: 'error', message: 'Completa el formulario' },
		PasswordMin: { type: 'error', message: 'La contraseña es muy corta' },
		Repeat: { type: 'error', message: 'Verifica los datos e inténtalo de nuevo' },
		repeat: { type: 'error', message: 'Ocurrió un error, inténtalo de nuevo' },
		noProduct: { type: 'error', message: 'Añade algunos productos a tu carrito' },
		'Te enviamos un correo...': { type: 'success', message: 'Te enviamos un correo...' },
		'Firebase: Error (auth/email-already-in-use).': { type: 'error', message: 'La cuenta ya está en uso' },
		'Se ha guardado correctamente': { type: 'success', message: 'Guardado correctamente' },
		'Eliminado correctamente': { type: 'success', message: 'Eliminado correctamente' },
		'Actualizado correctamente': { type: 'success', message: 'Actualizado correctamente' },
		'Transferencia anulada': { type: 'success', message: 'Transferencia anulada' },
		RegisterComplete: { type: 'success', message: 'Registro completado' },
		StaffRequestSent: { type: 'success', message: 'Solicitud enviada. Espera aprobación del admin' },
	}

	if (typeof value === 'string') return map[value] ?? { type: 'error', message: value }
	return { type: 'error', message: 'Ocurrió un error' }
}

export function UserProvider({ children }) {

	const [user, setUser] = useState(undefined)
	const [servicios, setServicios] = useState(undefined)
	const [perfil, setPerfil] = useState(undefined)
	const [theme, setThemeState] = useState('neutral')
	const [accent, setAccentState] = useState('cyan')
	const successTimerRef = useRef(null)

	useEffect(() => {
		return firebaseOnAuth(setUser, setUserDB)
	}, [])

	useEffect(() => {
		try {
			const saved = localStorage.getItem('theme')
			if (saved && THEMES.includes(saved)) setThemeState(saved)
		} catch { }
	}, [])

	useEffect(() => {
		try {
			const saved = localStorage.getItem('accent')
			if (saved && ACCENTS.includes(saved)) setAccentState(saved)
		} catch { }
	}, [])

	useEffect(() => {
		if (typeof document === 'undefined') return

		const nextTheme = THEMES.includes(theme) ? theme : 'neutral'
		document.documentElement.dataset.theme = nextTheme
		document.documentElement.classList.toggle('dark', nextTheme === 'dark')
		try { localStorage.setItem('theme', nextTheme) } catch { }
	}, [theme])

	useEffect(() => {
		if (typeof document === 'undefined') return

		const nextAccent = ACCENTS.includes(accent) ? accent : 'cyan'
		document.documentElement.dataset.accent = nextAccent
		try { localStorage.setItem('accent', nextAccent) } catch { }
	}, [accent])

	const [sucursales, setSucursales] = useState(undefined)
	const [personal, setPersonal] = useState(undefined)
	const [clientes, setClientes] = useState(undefined)
	const [tareas, setTareas] = useState(undefined)

	const [userDB, setUserDB] = useState(undefined)
	const [distributorPDB, setDistributorPDB] = useState(undefined)
	const [productDB, setProduct] = useState(undefined)
	const [item, setItem] = useState(undefined)
	const [cart, setCart] = useState({})
	const [success, setSuccess] = useState(null)
	const [pedidos, setPedidos] = useState([])

	const [pendientes, setPendientes,] = useState(undefined)
	const [qr, setQr] = useState('');
	const [QRurl, setQRurl] = useState('');
	const [recetaDB, setRecetaDB] = useState({});
	const [filter, setFilter] = useState('');
	const [filterQR, setFilterQR] = useState('');
	const [pendienteDB, setPendienteDB] = useState(undefined);
	const [nav, setNav] = useState(false)
	const [temporal, setTemporal] = useState(undefined)
	const [userUuid, setUserUuid] = useState(undefined)
	const [modal, setModal] = useState('')
	const [msg, setMsg] = useState('')
	const [tienda, setTienda] = useState(undefined)
	const timer = useRef(null);

	const videoRef = useRef();
	const [play, setPlay] = useState(true)
	const [sound, setSound] = useState(false)
	const [introVideo, setUserIntroVideo] = useState(undefined)

	const videoClientRef = useRef();
	const [soundClient, setSoundClient] = useState(false)
	const [introClientVideo, setUserIntroClientVideo] = useState(undefined)
	const [search, setSearch] = useState(false)
	const [sound1, setSound1] = useState(false)
	const [sound2, setSound2] = useState(false)
	const [whatsapp, setWhatsapp] = useState(false)
	const [whatsappMSG, setWhatsappMSG] = useState('')
	const [state, setState] = useState({})
	const [webScann, setWebScann] = useState(false)
	const [businessData, setBusinessData] = useState(undefined)
	const [qrBCP, setQrBCP] = useState(undefined)
	const [paySuccess, setPaySuccess] = useState(undefined)
	const [filterDis, setFilterDis] = useState('')

	const setUserProfile = (data) => {
		setUser(data)
	}
	const setUserData = (data) => {
		setUserDB(data)
	}
	const setUserDistributorPDB = (data) => {
		setDistributorPDB(data)
	}
	const setUserProduct = (data) => {
		setProduct(data)
	}
	const setUserPedidos = (data) => {
		setPedidos(data)
	}
	const setUserCart = (data) => {
		setCart(data)
	}
	const setUserItem = (data) => {
		setItem(data)
	}
	const setUserSuccess = (data, time) => {
		const config = resolveToastConfig(data)

		if (!config) {
			setSuccess(null)
			toast.dismiss()
			if (successTimerRef.current) clearTimeout(successTimerRef.current)
			return
		}

		setSuccess(data)

		const duration = typeof time === 'number' ? time : 5000
		const id = typeof data === 'string' ? data : 'app-toast'

		if (successTimerRef.current) clearTimeout(successTimerRef.current)
		successTimerRef.current = setTimeout(() => setSuccess(null), duration)

		if (config.type === 'success') toast.success(config.message, { id, duration })
		else if (config.type === 'loading') toast.loading(config.message, { id, duration })
		else if (config.type === 'info') toast(config.message, { id, duration })
		else toast.error(config.message, { id, duration })
	}

	const setTheme = (nextTheme) => {
		if (!THEMES.includes(nextTheme)) return setThemeState('neutral')
		setThemeState(nextTheme)
	}

	const setAccent = (nextAccent) => {
		if (!ACCENTS.includes(nextAccent)) return setAccentState('cyan')
		setAccentState(nextAccent)
	}

	const cycleTheme = () => {
		setThemeState((prev) => {
			const idx = THEMES.indexOf(prev)
			return THEMES[(idx + 1) % THEMES.length]
		})
	}
	const setIntroVideo = (data) => {
		setUserIntroVideo(data)
		// if (introVideo === undefined) {
		// 	return
		// }
		const interval = setInterval(() => {
			console.log('int')
			if (videoRef && videoRef.current && videoRef.current.ended) {
				setUserIntroVideo(false)
				clearInterval(interval)
			}
		}, 1000)

		return clearInterval(interval)
	}



	const setIntroClientVideo = (data) => {
		setUserIntroClientVideo(data)

		const interval = setInterval(() => {
			console.log('int')
			if (videoClientRef.current.ended) {
				setUserIntroClientVideo(false)
				clearInterval(interval)
			}
		}, 1000)
	}

	const value = useMemo(() => {
		return ({
			theme,
			setTheme,
			cycleTheme,
			accent,
			setAccent,
			user,
			userDB,
			distributorPDB,
			productDB,
			pedidos,
			item,
			cart,
			success,
			qr,
			QRurl,
			recetaDB,
			filter,
			filterQR,
			pendienteDB,
			nav,
			userUuid,
			modal,
			msg,
			tienda,
			introVideo,
			play,
			sound,
			videoRef,
			state,
			videoClientRef,
			soundClient,
			introClientVideo, search,
			sound1,
			sound2,
			whatsapp,
			whatsappMSG,
			businessData,
			webScann,
			qrBCP, paySuccess, filterDis,
			pendientes, setPendientes,
			servicios, setServicios,
			sucursales, setSucursales,
			personal, setPersonal,
			clientes, setClientes,
			tareas, setTareas,
			perfil, setPerfil,
			setFilterDis,
			setPaySuccess, setQrBCP,
			setWebScann,
			setBusinessData,
			setWhatsappMSG,
			setWhatsapp,
			setSound2,
			setSound1,
			setSearch,
			setIntroClientVideo,
			setSoundClient,
			setState,
			setSound,
			setPlay,
			setIntroVideo,
			setTienda,
			setMsg,
			setModal,
			setUserUuid,
			temporal,
			setTemporal,
			setNav,
			setPendienteDB,
			setFilterQR,
			setFilter,
			setRecetaDB,
			setQRurl,
			setQr,
			setUserProfile,
			setUserData,
			setUserCart,
			setUserDistributorPDB,
			setUserProduct,
			setUserPedidos,
			setUserSuccess,
			setUserItem
		})
	}, [theme, accent, user, userDB, distributorPDB, productDB, pedidos, item, cart, success, qr, QRurl, recetaDB, filter, filterQR, pendienteDB, nav, temporal, userUuid, modal, msg, tienda, introVideo, play, sound, state, videoClientRef,
		soundClient,
		introClientVideo,
		search,
		sound1,
		sound2, whatsapp,
		businessData,
		webScann,
		qrBCP,
		paySuccess, filterDis,
		servicios,
		sucursales,
		personal,
		clientes,
		pendientes,
		tareas, perfil
	])

	return (
		<UserContext.Provider value={value} >
			<Toaster
				position="top-right"
				containerStyle={{ zIndex: 1000000010 }}
				toastOptions={{
					duration: 5000,
					style: {
						background: 'rgb(var(--toast-bg))',
						color: 'rgb(var(--toast-text))',
					},
					success: {
						iconTheme: { primary: '#22c55e', secondary: 'rgb(var(--toast-bg))' },
					},
					error: {
						iconTheme: { primary: '#ef4444', secondary: 'rgb(var(--toast-bg))' },
					},
				}}
			/>
			{children}
		</UserContext.Provider>
	)
}

export function useUser() {
	const context = useContext(UserContext)
	if (!context) {
		throw new Error('error')
	}
	return context
}
