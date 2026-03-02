'use client';

import Button from '@/components/Button'

import { useUser } from '@/context'
import { useRouter } from 'next/navigation';
import { isCliente } from '@/lib/roles'

export default function Card({ nombre1, nombre2, nombre3, costo, url, empresa, descripcion, i, recetado, detalle, inmediato }) {

    const { setFilterDis, user, userDB, distributorPDB, setUserDistributorPDB, setUserItem, item, setUserData, setUserSuccess, cart, setUserCart, modal, setModal, setFilter, success } = useUser()
    const router = useRouter()
    // console.log(userDB)
    function seeMore(e) {
        setUserItem(i)
        router.push('/Producto')
    }

    const addCart = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setUserCart({ ...cart, [i.uuid]: { ...i, costo: i.precio , cantidad: detalle !== undefined ? detalle.cantidad : 1 } })
    }

    const addPlussCart = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setUserCart({ ...cart, [i.uuid]: { ...i, costo: i.precio , cantidad: detalle !== undefined ? detalle.cantidad : cart[i.uuid].cantidad + 1 } })
    }

    const addLessCart = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const obj = { ...cart }
        delete obj[i.uuid]

        cart[i.uuid].cantidad - 1 == 0
            ? setUserCart(obj)
            : setUserCart({ ...cart, [i.uuid]: { ...i, costo: i.precio , cantidad: detalle !== undefined ? 0 : cart[i.uuid].cantidad - 1 } })
    }

    return (
        <div className="relative w-full max-w-[500px] bg-white rounded-[20px] rounded-bl-[10px] shadow-2xl shadow mt-5" style={{ display: 'grid', gridTemplateColumns: 'auto 150px', gridAutoFlow: 'dense' }}>
            <div className=" p-4 pt-4  flex flex-col justify-start leading-normal">
                <div className=" font-bold text-[16px] bg-white flex flex-col w-full justify-between items-between text-gray-950 col-span-2">
                    <div className=" font-bold text-[16px]  text-black uppercase">
                        {i['nombre 1']}
                    </div>
                    {i['nombre 2'] && <div className=" font-regular text-[14px]  text-black uppercase">
                        {i['nombre 2']}
                    </div>}
                    {i['nombre 3'] && <div className=" font-regular text-[14px] text-black uppercase">
                        {i['nombre 3']}
                    </div>}
                </div>
                {i.categoria && <p className="text-gray-700 text-[16px] pb-[10px] font-bold">{i.categoria}</p>}
                <div className="">
                    <p className="text-gray-700 text-[14px]">{i['descripcion basica']}</p>
                </div>
            </div>

            <div>
                <div className="relative w-[150px]  object-contain rounded-[20px] text-center" >
                    <img src={i.url} className='w-[150px]  rounded-[20px]' alt="" />
                </div>
            </div>
            <div className='w-full flex justify-start  items-center px-2 py-4'>
                {userDB && !isCliente(userDB)
                    ? <>
                        <div className="flex items-baseline text-gray-900 bg-white rounded-full p-2">
                            <span className="text-[24px]  text-red-600 font-bold">{i.precio}</span>
                            <span className="text-[24px] text-red-600 font-bold">BS</span>
                        </div>
                        {/* <div className="flex items-baseline text-gray-900 bg-white rounded-full px-0 py-2">
                            <span className="text-[18px]  text-gray-400">{inmediato}</span>
                            <span className="text-[18px] text-gray-400">BS</span>
                        </div> */}
                    </>
                    : <span className="text-[18px] text-red-600 font-semibold">Añadir {i['recepcion por']}</span>
                }
            </div>
            <div className='flex py-4 pr-4'>
                {cart && cart[i.uuid] && cart[i.uuid].cantidad !== undefined && cart[i.uuid].cantidad !== 0
                    ? <div className='flex w-full'>
                        <Button theme='MiniSecondary' click={(e) => addLessCart(e, i)}>-</Button>
                        {cart && cart[i.uuid] && cart[i.uuid].cantidad !== undefined && cart[i.uuid].cantidad !== 0 && <span className='flex justify-center items-center text-[16px] text-right px-5 w-[40px] font-bold'> {cart[i.uuid].cantidad} </span>}
                        <Button theme='MiniPrimary' click={(e) => addPlussCart(e, i)}>+</Button>
                    </div>
                    : <Button theme='MiniPrimaryComprar' click={(e) => addCart(e, i)}>Añadir</Button>}
            </div>
        </div>
    )
}




