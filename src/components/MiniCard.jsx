'use client';

import Button from '@/components/Button'
import { useUser } from '@/context'
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react'

export default function Card({ nombre1, nombre2, nombre3, costo, url, empresa, descripcion, i, inmediato }) {

    const { user, userDB, distributorPDB, setUserDistributorPDB, setUserItem, item, setUserData, setUserSuccess, cart, setUserCart } = useUser()
    const [velox, setVelox] = useState(false);
    const router = useRouter()

    function onChangeHandler(e) {
         setUserCart({ ...cart, [i.uuid]: { ...i, observacion: e.target.value } })
    }
    const addCart = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setUserCart({ ...cart, [i.uuid]: { ...i, cantidad: 1 } })
    }
    const addPlussCart = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setUserCart({ ...cart, [i.uuid]: { ...i, cantidad: cart[i.uuid].cantidad + 1 } })
    }
    const addLessCart = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const obj = { ...cart }
        delete obj[i.uuid]
        console.log(obj)
        cart[i.uuid].cantidad - 1 == 0
            ? setUserCart(obj)
            : setUserCart({ ...cart, [i.uuid]: { ...i, cantidad: cart[i.uuid].cantidad - 1 } })
    }
    const handlerPlussVelox = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setVelox(true)
        setUserCart({ ...cart, [i.uuid]: { ...i, adicional: inmediato } })
    }
    const handlerLessVelox = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setVelox(false)
        setUserCart({ ...cart, [i.uuid]: { ...i, adicional: null } })
    }
    
    return (

            <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                <td className="min-w-[200px] px-3 py-4 text-[16px]  text-gray-700 align-middle">
                    {i['nombre 1']} <br />
                    <span className="text-[16px]  text-gray-700  tracking-tight">{i.costo} Bs.</span>
                </td>
                <td className="text-center ">
                    <div className='w-full flex justify-center'>
                        {velox ? <svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" onClick={handlerLessVelox}>
                            <circle cx="12.5" cy="12.5" r="12.5" fill="#32CD32" />
                            <path fill-rule="evenodd" clipRule="evenodd" d="M4 13.5L6.16667 11.3333L10.5 15.6667L19.1667 7L21.3333 9.16667L10.5 20L4 13.5Z" fill="white" />
                        </svg>
                            : <svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" onClick={handlerPlussVelox}>
                                <circle cx="12.5" cy="12.5" r="12.5" fill="#9ca3af" />
                                <path fill-rule="evenodd" clipRule="evenodd" d="M4 13.5L6.16667 11.3333L10.5 15.6667L19.1667 7L21.3333 9.16667L10.5 20L4 13.5Z" fill="white" />
                            </svg>}
                    </div>
                </td>
                <td className="min-w-[150px] text-center">
                    <textarea id="message" rows="1" onChange={(e) => onChangeHandler(e, i)} cols="1" name='nombre de producto 1' defaultValue={i['nombre de producto 1']} className="block p-1.5  w-full h-full text-sm text-gray-900 bg-white rounded-lg  focus:ring-gray-100 focus:border-gray-100 focus:outline-none resize-x-none" placeholder="Escribe aqui..."></textarea>
                {/* <Button theme='Primary' click={(e) => addObs(e, i)}>Observación</Button> */}
                </td>
                <td className="px-3 py-4  text-gray-900">
                    <div className="lg:flex lg:w-full lg:justify-center">
                        {cart && cart[i.uuid] && cart[i.uuid].cantidad !== undefined && cart[i.uuid].cantidad !== 0
                            ? <div className='flex w-[80px] items-center flex-col-reverse md:flex-row md:w-full md:max-w-[130px] justify-between'>
                                <Button theme='MiniSecondary' click={(e) => addLessCart(e, i)}>-</Button>
                                <span className='px-4'>
                                    {cart && cart[i.uuid] && cart[i.uuid].cantidad !== undefined && cart[i.uuid].cantidad !== 0 && <span className='block text-[16px] text-center '>{cart[i.uuid].cantidad}</span>}
                                </span>
                                <Button theme='MiniPrimary' click={(e) => addPlussCart(e, i)}>+</Button>
                            </div>
                            : <Button theme='MiniPrimary' click={(e) => addCart(e, i)}>Comprar</Button>
                        }
                    </div>
                </td>
                <td className="px-3 py-4 font-semibold text-gray-900">
                    <div className="text-center text-[16px] text-gray-700">
                     {(cart && cart[i.uuid] && cart[i.uuid].cantidad !== undefined
                            ? (cart[i.uuid].cantidad * i.costo) + (cart[i.uuid].adicional && cart[i.uuid].adicional !== undefined ? cart[i.uuid].cantidad * i.adicional : 0)
                            : i.costo)} Bs.
                        
                        {/* <span className="text-[16px]  text-gray-700  font-extrabold">   Bs.</span> */}
                    </div>
                </td>
            </tr>

    )
}




