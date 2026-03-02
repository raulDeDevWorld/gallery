'use client';

export default function Button({ styled, children }) {
    return (
        <h3 className={`w-full font-bold text-[16px] text-center py-5 px-0 ${styled}`}>{children}</h3>
    )
}
