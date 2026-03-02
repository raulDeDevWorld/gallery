'use client';
import { useState } from 'react'
import { useUser } from '@/context/'
import { useRouter } from 'next/navigation';

export default function Button({ theme, styled, click, children }) {

    const { user, cart, tienda, productDB, setUserProduct, setUserItem, setUserSuccess, success } = useUser()
    const router = useRouter()

    const [add, setAdd] = useState(false)
    const [showCart, setShowCart] = useState(false)

    function HandlerCheckOut() {
        // Object.keys(cart).length > 0
        //     ? (tienda === 'Recetar' ? router.push('/Cliente/Recetar') : router.push('/Cliente/Comprar'))
        //     : success !== 'noProduct' && setUserSuccess('noProduct')
    }



    return (<div className={` transition-all ease-in-out duration-300  z-40`}>
        <button type="button" onClick={HandlerCheckOut} className="h-[40px] w-[40px] my-1 bg-[#ffffff] border-[2px] border-black font-medium rounded-full text-sm p-2.5 text-center flex justify-center items-center ">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9.05136 7.61905C9.33337 7.61905 9.56993 7.52762 9.76103 7.34476C9.95213 7.16191 10.0474 6.93587 10.0467 6.66667V4.76191H12.0374C12.3194 4.76191 12.5559 4.67048 12.747 4.48762C12.9381 4.30476 13.0333 4.07873 13.0327 3.80953C13.0327 3.53968 12.9371 3.31334 12.746 3.13048C12.5549 2.94762 12.3187 2.85651 12.0374 2.85715H10.0467V0.952384C10.0467 0.682543 9.95114 0.456194 9.76003 0.273336C9.56893 0.0904794 9.33271 -0.000631625 9.05136 3.29544e-06C8.76935 3.29544e-06 8.53279 0.0914318 8.34169 0.274289C8.15058 0.457146 8.05536 0.683178 8.05603 0.952384V2.85715H6.06537C5.78336 2.85715 5.5468 2.94857 5.3557 3.13143C5.16459 3.31429 5.06937 3.54032 5.07004 3.80953C5.07004 4.07937 5.16559 4.30572 5.35669 4.48857C5.54779 4.67143 5.78402 4.76254 6.06537 4.76191H8.05603V6.66667C8.05603 6.93651 8.15158 7.16286 8.34268 7.34572C8.53379 7.52857 8.77001 7.61968 9.05136 7.61905ZM14.028 20C14.5754 20 15.0442 19.8133 15.4344 19.44C15.8246 19.0667 16.0193 18.6184 16.0187 18.0952C16.0187 17.5714 15.8236 17.1229 15.4334 16.7495C15.0432 16.3762 14.5748 16.1898 14.028 16.1905C13.4806 16.1905 13.0118 16.3771 12.6216 16.7505C12.2314 17.1238 12.0367 17.5721 12.0374 18.0952C12.0374 18.619 12.2324 19.0676 12.6226 19.441C13.0128 19.8143 13.4812 20.0006 14.028 20ZM4.0747 20C4.62214 20 5.09094 19.8133 5.48111 19.44C5.87128 19.0667 6.06603 18.6184 6.06537 18.0952C6.06537 17.5714 5.87028 17.1229 5.48011 16.7495C5.08994 16.3762 4.62147 16.1898 4.0747 16.1905C3.52727 16.1905 3.05847 16.3771 2.6683 16.7505C2.27813 17.1238 2.08338 17.5721 2.08404 18.0952C2.08404 18.619 2.27913 19.0676 2.6693 19.441C3.05947 19.8143 3.52794 20.0006 4.0747 20ZM14.028 15.2381C14.7911 15.2381 15.3677 14.9244 15.7579 14.2971C16.1481 13.6698 16.152 13.047 15.7698 12.4286L14.4261 10.0952L18.0093 2.85715H19.0047C19.2867 2.85715 19.5232 2.76572 19.7143 2.58286C19.9054 2.4 20.0007 2.17397 20 1.90476C20 1.63492 19.9044 1.40857 19.7133 1.22572C19.5222 1.04286 19.286 0.951749 19.0047 0.952384H17.3624C17.1799 0.952384 17.0057 1 16.8398 1.09524C16.6739 1.19048 16.5495 1.3254 16.4666 1.5L12.5101 9.52381H5.51793L1.93474 3.33334C1.8518 3.19048 1.73568 3.07524 1.58638 2.98762C1.43708 2.9 1.27119 2.85651 1.08871 2.85715C0.707169 2.85715 0.420845 3.01207 0.22974 3.32191C0.0386372 3.63175 0.0346584 3.94508 0.217798 4.26191L3.77611 10.4286C3.95858 10.746 4.20343 10.9921 4.51066 11.1667C4.81788 11.3413 5.15364 11.4286 5.51793 11.4286H12.9331L14.028 13.3333H3.07937C2.79736 13.3333 2.56081 13.4248 2.3697 13.6076C2.1786 13.7905 2.08338 14.0165 2.08404 14.2857C2.08404 14.5556 2.1796 14.7819 2.3707 14.9648C2.5618 15.1476 2.79803 15.2387 3.07937 15.2381H14.028Z" fill="#00E2FF" />
                </svg>
              
            <span className='inline-block absolute top-[10px] text-[#ffffff] right-[10px] bg-black w-[16px] text-[14px] rounded-full border border-[#ffffff]'>{
                Object.values(cart).reduce((acc, i, index) => {
                    const sum = i['cantidad'] + acc
                    return sum
                }, 0)
            }</span>
            <span className="sr-only">Icon description</span>
        </button>
        {/* <div className={`absolute items-center justify-between top-[40px] w-1/2 bg-transparent md:flex md:w-auto  transition-all	z-0 ${showCart ? 'right-0' : 'right-[-400px]'}`} >
            <ul className="flex flex-col bg-gray-100 p-4 md:p-0 mt-4 font-medium border border-gray-100 rounded-lg  md:flex-row md:space-x-8 md:mt-0 md:border-0 md:bg-white ">
                {Object.values(cart).map((i, index) => <li className='border-b border-gray-300 py-[12px]' key={index}>
                    {i['nombre de producto 1']} <br /> {i['costo'] * i['cantidad']} BOB
                </li>)}

            <li className='border-b border-gray-300 text-red-600 py-[6px]'>
                 TOTAL: {Object.values(cart).reduce((acc, i, index) => {
                    const sum = i['costo'] * i['cantidad']
                    return sum + acc
                }, 0)} BOB
                </li>
            </ul>
        </div> */}
        <div className='absolute w-screen left-0 top-[70px]'>
        </div>

    </div>)
}

