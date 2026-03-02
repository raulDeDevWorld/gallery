import style from './Tolkipt.module.css'
import { useUser } from '@/context/'

export default function Error (props) {
    const { setFilterDis, user, userDB, distributorPDB, setUserDistributorPDB, setUserItem, item, setUserData, setUserSuccess, cart, setUserCart, modal, setModal, setFilter, success } = useUser()

    return (
        <span className={style.error}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M10 0C5.286 0 2.929 0 1.464 1.464C0 2.93 0 5.286 0 10C0 14.714 0 17.071 1.464 18.535C2.93 20 5.286 20 10 20C14.714 20 17.071 20 18.535 18.535C20 17.072 20 14.714 20 10C20 5.286 20 2.929 18.535 1.464C17.072 0 14.714 0 10 0ZM10 4.25C10.1989 4.25 10.3897 4.32902 10.5303 4.46967C10.671 4.61032 10.75 4.80109 10.75 5V11C10.75 11.1989 10.671 11.3897 10.5303 11.5303C10.3897 11.671 10.1989 11.75 10 11.75C9.80109 11.75 9.61032 11.671 9.46967 11.5303C9.32902 11.3897 9.25 11.1989 9.25 11V5C9.25 4.80109 9.32902 4.61032 9.46967 4.46967C9.61032 4.32902 9.80109 4.25 10 4.25ZM10 15C10.2652 15 10.5196 14.8946 10.7071 14.7071C10.8946 14.5196 11 14.2652 11 14C11 13.7348 10.8946 13.4804 10.7071 13.2929C10.5196 13.1054 10.2652 13 10 13C9.73478 13 9.48043 13.1054 9.29289 13.2929C9.10536 13.4804 9 13.7348 9 14C9 14.2652 9.10536 14.5196 9.29289 14.7071C9.48043 14.8946 9.73478 15 10 15Z" fill="#FFC700"/>
        </svg>
       <span className='ml-5'>{props.children}</span> </span>
    )
}