import style from './Msg.module.css'

export default function Error (props) {
    return (
        <span className={style.error}>{props.children}</span>
    )
}