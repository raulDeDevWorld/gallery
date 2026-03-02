
'use client';
import { useUser } from '@/context'
import QRscanner from '@/components/QRscanner'
import {QRreaderUtils} from '@/utils/QRreader'

export default function Page({ styled, name, change }) {
    const {  userDB, filterQR, setFilterQR,  webScann, setWebScann, } = useUser()

    function HandlerOnChange(e) {
        QRreaderUtils(e, setFilterQR,)
    }
    function handlerWebScann(e) {
        e.stopPropagation()
        e.preventDefault()
        setWebScann(!webScann)
    }
    return (<div className='min-h-[80vh]'>
        <h3 className='text-white text-center pb-5'>Rastrea tu dinero facilmente</h3>
        <label htmlFor="qr" className='w-[90vw] relative mb-3 left-0 right-0 m-auto  max-w-[600px] lg:min-w-[600px] border-[5px] border-[#000000] flex justify-between items-center text-gray-950 text-[14px] h-[50px] bg-[#FFF500] rounded-full py-[5px] px-[10px] lg:px-[20px] z-20' >
            <span className=''>
                <svg width="32" height="32" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clipRule="evenodd" d="M0.0699999 3.258C-6.70552e-08 3.626 0 4.068 0 4.95V12C0 15.771 -1.19209e-07 17.657 1.172 18.828C2.343 20 4.229 20 8 20H12C15.771 20 17.657 20 18.828 18.828C20 17.657 20 15.771 20 12V9.798C20 7.166 20 5.849 19.23 4.994C19.1594 4.91508 19.0846 4.83997 19.006 4.769C18.151 4 16.834 4 14.202 4H13.828C12.675 4 12.098 4 11.56 3.847C11.2648 3.7626 10.9802 3.64449 10.712 3.495C10.224 3.224 9.816 2.815 9 2L8.45 1.45C8.176 1.176 8.04 1.04 7.896 0.92C7.27667 0.40664 6.51694 0.0919439 5.716 0.017C5.53 -4.09782e-08 5.336 0 4.95 0C4.067 0 3.626 -6.70552e-08 3.258 0.0699999C2.46784 0.219224 1.741 0.603137 1.17231 1.17165C0.603613 1.74017 0.219472 2.46789 0.0699999 3.258ZM14.282 1C14.648 1 14.832 1 14.985 1.02C16.003 1.16 16.813 1.963 16.999 3C16.8467 2.96552 16.6929 2.93849 16.538 2.919C15.898 2.835 15.09 2.835 14.088 2.835H13.754C12.812 2.835 12.454 2.83 12.129 2.734C11.9398 2.67789 11.7579 2.59969 11.587 2.501C11.291 2.331 11.035 2.073 10.369 1.383L10 1H14.284H14.282ZM11 7.25C10.8011 7.25 10.6103 7.32902 10.4697 7.46967C10.329 7.61032 10.25 7.80109 10.25 8C10.25 8.19891 10.329 8.38968 10.4697 8.53033C10.6103 8.67098 10.8011 8.75 11 8.75H16C16.1989 8.75 16.3897 8.67098 16.5303 8.53033C16.671 8.38968 16.75 8.19891 16.75 8C16.75 7.80109 16.671 7.61032 16.5303 7.46967C16.3897 7.32902 16.1989 7.25 16 7.25H11Z" fill="black" />
                </svg>
            </span>
            <span className=' left-0 top-0 bottom-0 my-auto text-center text-[14px] font-bold'> Tracking por QR...</span>
            <span className=''>
                <svg width="32" height="32" viewBox="0 0 323 323" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M138.71 0.669922H12.4399C9.25734 0.669922 6.20509 1.93419 3.95465 4.18463C1.70421 6.43507 0.439941 9.48732 0.439941 12.6699V138.93C0.439941 142.112 1.70421 145.165 3.95465 147.415C6.20509 149.666 9.25734 150.93 12.4399 150.93H138.71C141.893 150.93 144.945 149.666 147.195 147.415C149.446 145.165 150.71 142.112 150.71 138.93V12.6699C150.71 9.48732 149.446 6.43507 147.195 4.18463C144.945 1.93419 141.893 0.669922 138.71 0.669922ZM129.24 43.5999V129.47H21.9099V22.1299H129.24V43.5999Z" fill="black" />
                    <path d="M95.7799 43.6001H55.3799C52.1973 43.6001 49.145 44.8644 46.8946 47.1148C44.6442 49.3652 43.3799 52.4175 43.3799 55.6001V96.0001C43.3799 99.1827 44.6442 102.235 46.8946 104.485C49.145 106.736 52.1973 108 55.3799 108H95.7799C98.9625 108 102.015 106.736 104.265 104.485C106.516 102.235 107.78 99.1827 107.78 96.0001V55.6001C107.78 52.4175 106.516 49.3652 104.265 47.1148C102.015 44.8644 98.9625 43.6001 95.7799 43.6001Z" fill="black" />
                    <path d="M267.51 43.6001H227.11C223.927 43.6001 220.875 44.8644 218.625 47.1148C216.374 49.3652 215.11 52.4175 215.11 55.6001V96.0001C215.11 99.1827 216.374 102.235 218.625 104.485C220.875 106.736 223.927 108 227.11 108H267.51C270.692 108 273.745 106.736 275.995 104.485C278.246 102.235 279.51 99.1827 279.51 96.0001V55.6001C279.51 52.4175 278.246 49.3652 275.995 47.1148C273.745 44.8644 270.692 43.6001 267.51 43.6001Z" fill="black" />
                    <path d="M310.44 0.669922H184.18C180.997 0.669922 177.945 1.93419 175.694 4.18463C173.444 6.43507 172.18 9.48732 172.18 12.6699V138.93C172.18 142.112 173.444 145.165 175.694 147.415C177.945 149.666 180.997 150.93 184.18 150.93H310.44C313.622 150.93 316.675 149.666 318.925 147.415C321.175 145.165 322.44 142.112 322.44 138.93V12.6699C322.44 9.48732 321.175 6.43507 318.925 4.18463C316.675 1.93419 313.622 0.669922 310.44 0.669922ZM301 43.5999V129.47H193.64V22.1299H301V43.5999Z" fill="black" />
                    <path d="M178 215.33H193.61V231C193.613 232.552 194.231 234.04 195.33 235.137C196.428 236.234 197.917 236.85 199.47 236.85H209.23C209.998 236.85 210.759 236.699 211.469 236.405C212.178 236.111 212.823 235.68 213.366 235.136C213.91 234.593 214.341 233.948 214.635 233.239C214.929 232.529 215.08 231.768 215.08 231V215.33H230.69C231.459 215.331 232.221 215.181 232.932 214.887C233.643 214.594 234.289 214.163 234.833 213.62C235.377 213.077 235.809 212.431 236.104 211.721C236.398 211.011 236.55 210.249 236.55 209.48V199.72C236.55 198.951 236.398 198.189 236.104 197.479C235.809 196.769 235.377 196.123 234.833 195.58C234.289 195.036 233.643 194.606 232.932 194.312C232.221 194.019 231.459 193.869 230.69 193.87H215.11V178.25C215.11 176.698 214.494 175.21 213.396 174.113C212.299 173.016 210.811 172.4 209.26 172.4H178C176.448 172.4 174.96 173.016 173.863 174.113C172.766 175.21 172.15 176.698 172.15 178.25V209.48C172.15 211.031 172.766 212.519 173.863 213.616C174.96 214.714 176.448 215.33 178 215.33Z" fill="black" />
                    <path d="M252.2 215.33H242.43C239.199 215.33 236.58 217.949 236.58 221.18V230.95C236.58 234.181 239.199 236.8 242.43 236.8H252.2C255.431 236.8 258.05 234.181 258.05 230.95V221.18C258.05 217.949 255.431 215.33 252.2 215.33Z" fill="black" />
                    <path d="M295.13 215.33H285.36C282.129 215.33 279.51 217.949 279.51 221.18V230.95C279.51 234.181 282.129 236.8 285.36 236.8H295.13C298.361 236.8 300.98 234.181 300.98 230.95V221.18C300.98 217.949 298.361 215.33 295.13 215.33Z" fill="black" />
                    <path d="M316.6 236.8H306.83C303.599 236.8 300.98 239.419 300.98 242.65V252.42C300.98 255.651 303.599 258.27 306.83 258.27H316.6C319.831 258.27 322.45 255.651 322.45 252.42V242.65C322.45 239.419 319.831 236.8 316.6 236.8Z" fill="black" />
                    <path d="M316.59 172.4H263.9C262.348 172.4 260.859 173.016 259.76 174.113C258.661 175.21 258.043 176.697 258.04 178.25V209.48C258.043 211.032 258.661 212.52 259.76 213.617C260.859 214.714 262.348 215.33 263.9 215.33H273.66C275.212 215.33 276.7 214.714 277.797 213.616C278.894 212.519 279.51 211.031 279.51 209.48V193.87H316.59C317.359 193.87 318.121 193.718 318.831 193.424C319.541 193.129 320.187 192.697 320.73 192.153C321.273 191.609 321.704 190.963 321.998 190.252C322.291 189.541 322.441 188.779 322.44 188.01V178.25C322.44 176.698 321.824 175.21 320.727 174.113C319.63 173.016 318.142 172.4 316.59 172.4Z" fill="black" />
                    <path d="M215.11 285.59C215.111 284.821 214.961 284.059 214.667 283.348C214.374 282.637 213.943 281.991 213.4 281.447C212.857 280.902 212.211 280.471 211.501 280.176C210.791 279.881 210.029 279.73 209.26 279.73H193.64V242.65C193.64 241.098 193.024 239.61 191.926 238.513C190.829 237.416 189.341 236.8 187.79 236.8H178C176.448 236.8 174.96 237.416 173.863 238.513C172.766 239.61 172.15 241.098 172.15 242.65V316.81C172.149 317.579 172.299 318.341 172.592 319.052C172.886 319.762 173.316 320.409 173.86 320.953C174.403 321.497 175.049 321.929 175.759 322.224C176.469 322.518 177.231 322.67 178 322.67H187.76C188.529 322.67 189.291 322.518 190.001 322.224C190.711 321.929 191.357 321.497 191.9 320.953C192.443 320.409 192.874 319.762 193.167 319.052C193.461 318.341 193.611 317.579 193.61 316.81V301.2H209.23C210.781 301.2 212.269 300.583 213.366 299.486C214.464 298.389 215.08 296.901 215.08 295.35L215.11 285.59Z" fill="black" />
                    <path d="M316.59 279.73H301V264.12C301 263.351 300.848 262.589 300.554 261.879C300.259 261.169 299.827 260.523 299.283 259.98C298.739 259.437 298.093 259.006 297.382 258.712C296.671 258.419 295.909 258.269 295.14 258.27H285.39C284.621 258.269 283.859 258.419 283.148 258.712C282.437 259.006 281.791 259.437 281.247 259.98C280.703 260.523 280.271 261.169 279.976 261.879C279.682 262.589 279.53 263.351 279.53 264.12V279.73H258V264.12C258 262.568 257.384 261.08 256.287 259.983C255.19 258.886 253.702 258.27 252.15 258.27H221C220.231 258.269 219.469 258.419 218.758 258.712C218.047 259.006 217.401 259.437 216.857 259.98C216.313 260.523 215.881 261.169 215.586 261.879C215.292 262.589 215.14 263.351 215.14 264.12V273.88C215.14 274.649 215.292 275.411 215.586 276.121C215.881 276.831 216.313 277.477 216.857 278.02C217.401 278.564 218.047 278.994 218.758 279.288C219.469 279.581 220.231 279.731 221 279.73H236.61V295.35C236.61 296.901 237.226 298.389 238.324 299.487C239.421 300.584 240.909 301.2 242.46 301.2H258V316.81C258 318.364 258.617 319.855 259.716 320.954C260.815 322.053 262.306 322.67 263.86 322.67H273.62C274.389 322.67 275.151 322.518 275.861 322.224C276.572 321.929 277.217 321.497 277.76 320.953C278.304 320.409 278.734 319.763 279.028 319.052C279.321 318.341 279.471 317.579 279.47 316.81V301.2H301V316.81C300.999 317.579 301.149 318.341 301.443 319.052C301.736 319.763 302.167 320.409 302.71 320.953C303.253 321.497 303.899 321.929 304.609 322.224C305.32 322.518 306.081 322.67 306.85 322.67H316.61C317.379 322.67 318.141 322.518 318.851 322.224C319.562 321.929 320.207 321.497 320.75 320.953C321.294 320.409 321.724 319.763 322.018 319.052C322.311 318.341 322.461 317.579 322.46 316.81V285.59C322.461 284.819 322.31 284.056 322.016 283.344C321.721 282.631 321.289 281.984 320.743 281.44C320.198 280.895 319.55 280.464 318.837 280.17C318.125 279.877 317.361 279.727 316.59 279.73Z" fill="black" />
                    <path d="M230.73 301.2H220.96C217.729 301.2 215.11 303.819 215.11 307.05V316.82C215.11 320.051 217.729 322.67 220.96 322.67H230.73C233.961 322.67 236.58 320.051 236.58 316.82V307.05C236.58 303.819 233.961 301.2 230.73 301.2Z" fill="black" />
                    <path d="M95.7799 215.33H55.3799C52.1973 215.33 49.145 216.594 46.8946 218.845C44.6442 221.095 43.3799 224.147 43.3799 227.33V267.73C43.3799 270.913 44.6442 273.965 46.8946 276.215C49.145 278.466 52.1973 279.73 55.3799 279.73H95.7799C98.9625 279.73 102.015 278.466 104.265 276.215C106.516 273.965 107.78 270.913 107.78 267.73V227.33C107.78 224.147 106.516 221.095 104.265 218.845C102.015 216.594 98.9625 215.33 95.7799 215.33Z" fill="black" />
                    <path d="M138.71 172.4H12.4399C9.25734 172.4 6.20509 173.664 3.95465 175.915C1.70421 178.165 0.439941 181.217 0.439941 184.4V310.67C0.439941 313.852 1.70421 316.905 3.95465 319.155C6.20509 321.406 9.25734 322.67 12.4399 322.67H138.71C141.893 322.67 144.945 321.406 147.195 319.155C149.446 316.905 150.71 313.852 150.71 310.67V184.4C150.71 181.217 149.446 178.165 147.195 175.915C144.945 173.664 141.893 172.4 138.71 172.4ZM129.24 215.33V301.2H21.9099V193.87H129.24V215.33Z" fill="black" />
                </svg>
            </span>
            <span onClick={handlerWebScann} className='h-full text-right z-50 lg:hidden'>
                <svg className='h-[55px]' viewBox="0 0 20 35" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 3H15.414L12.707 0.293001C12.6143 0.199958 12.5041 0.126171 12.3828 0.0758854C12.2614 0.0256001 12.1313 -0.000189449 12 1.04767e-06H8C7.86866 -0.000189449 7.73857 0.0256001 7.61724 0.0758854C7.4959 0.126171 7.38571 0.199958 7.293 0.293001L4.586 3H2C0.897 3 0 3.897 0 5V16C0 17.103 0.897 18 2 18H18C19.103 18 20 17.103 20 16V5C20 3.897 19.103 3 18 3ZM10 15C7.29 15 5 12.71 5 10C5 7.29 7.29 5 10 5C12.71 5 15 7.29 15 10C15 12.71 12.71 15 10 15Z" fill="black" />
                </svg>
            </span>
        </label>
        <input id="qr" type="file" className='hidden' onChange={HandlerOnChange} accept="image/* " />

        {webScann && <div className={`lg:hidden`}>
            <QRscanner></QRscanner>
        </div>}
        {filterQR && filterQR !== undefined && filterQR.operacion === 'Envio'
                        && <table className="w-full  lg:w-full lg:min-w-auto text-[14px] text-left text-gray-500 rounded-[20px]">
                            <thead className="text-[12px] font-semibold uppercase tracking-wide text-thead-muted bg-thead-bg/70">
                                <tr>
                                    <th scope="col-3" className="w-1/2 px-3 py-3">
                                    </th>
                                    <th scope="col" className="px-3 py-3">
                                        Datos
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        Remitente
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.remitente && filterQR.remitente}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        DNI remitente
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['dni remitente'] && filterQR['dni remitente']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        Pais remitente
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['pais remitente'] && filterQR['pais remitente']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        Destinatario
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.destinatario && filterQR.destinatario}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-2 py-2 flex flex-col text-[14px] text-gray-700 ">
                                        DNI destinatario
                                    </td>
                                    <td className="px-2 py-2  text-gray-900 ">
                                        {filterQR.dni && filterQR.dni}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-2 py-2 flex flex-col text-[14px] text-gray-700 ">
                                        Pais destinatario
                                    </td>
                                    <td className="px-2 py-2  text-gray-900 ">
                                        {filterQR.pais && filterQR.pais}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        Celular de destinatario
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.celular && filterQR.celular}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Cuenta de destinatario:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['cuenta destinatario'] && filterQR['cuenta destinatario']}
                                    </td>
                                </tr>
                                {/* <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Divisa de envio:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['divisa de envio'] && filterQR['divisa de envio']}
                                    </td>
                                </tr> */}
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Importe mas comision:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.importe && filterQR.importe + filterQR.comision} {filterQR['divisa de envio'] && filterQR['divisa de envio']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Comision:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.comision} {filterQR['divisa de envio'] && filterQR['divisa de envio']}
                                    </td>
                                </tr>
                                {/* <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Divisa de receptor:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['divisa de receptor'] && filterQR['divisa de receptor']}
                                    </td>
                                </tr> */}
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Importe mas comision con el cambio aplicado:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.cambio && filterQR.cambio} {filterQR['divisa de receptor'] && filterQR['divisa de receptor']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Fecha:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.fecha && filterQR.fecha}
                                    </td>
                                </tr>
                                {/* <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Estado:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.estado && filterQR.estado}
                                    </td>
                                </tr> */}
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Estado:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                    <span className={`w-full block py-1 px-2 rounded-[10px] ${filterQR.estado == 'En verficación' && 'bg-gray-100'}   ${filterQR.estado == 'Transfiriendo' && 'bg-yellow-300'}   ${filterQR.estado == 'Exitoso' && 'bg-green-400'} ${filterQR.estado == 'Rechazado' && 'bg-red-400'}`}>{filterQR.estado}</span>
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Operacion:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.operacion && filterQR.operacion}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        ID de tracking:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.uuid}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    }

        {filterQR && filterQR !== undefined && filterQR.operacion === 'Cambio'
                        && <table className="w-full  lg:w-full lg:min-w-auto text-[14px] text-left text-gray-500 rounded-[20px]">
                            <thead className="text-[12px] font-semibold uppercase tracking-wide text-thead-muted bg-thead-bg/70">
                                <tr>
                                    <th scope="col-3" className="w-1/2 px-3 py-3">
                                    </th>
                                    <th scope="col" className="px-3 py-3">
                                        Datos
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        Usuario
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.usuario && filterQR.usuario}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        DNI de usuario
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['dni'] && filterQR['dni']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        Pais de usuario
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['pais'] && filterQR['pais']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                        Whatsapp de usuario
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.whatsapp && filterQR.whatsapp}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-2 py-2 flex flex-col text-[14px] text-gray-700 ">
                                    Cuenta de usuario
                                    </td>
                                    <td className="px-2 py-2  text-gray-900 ">
                                        {filterQR['cuenta bancaria'] && filterQR['cuenta bancaria']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-2 py-2 flex flex-col text-[14px] text-gray-700 ">
                                    Nombre de banco
                                    </td>
                                    <td className="px-2 py-2  text-gray-900 ">
                                        {filterQR.banco && filterQR.banco}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 flex flex-col text-[14px] text-gray-700 ">
                                    Divisa de envio
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['divisa de usuario'] && filterQR['divisa de usuario'] }
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                    Importe mas comision
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['importe'] && filterQR['importe'] + filterQR['comision']} {filterQR['divisa de usuario'] && filterQR['divisa de usuario'] }
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                    Comision
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['comision']} {filterQR['divisa de usuario'] && filterQR['divisa de usuario'] }
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                    Divisa de cambio
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR['divisa de cambio'] && filterQR['divisa de cambio']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                    Importe mas comision con el cambio aplicado
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.cambio} {filterQR['divisa de cambio'] && filterQR['divisa de cambio']}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Estado:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                    <span className={`w-full block py-1 px-2 rounded-[10px] ${filterQR.estado == 'En verficación' && 'bg-gray-100'}   ${filterQR.estado == 'Transfiriendo' && 'bg-yellow-300'}   ${filterQR.estado == 'Exitoso' && 'bg-green-400'} ${filterQR.estado == 'Rechazado' && 'bg-red-400'}`}>{filterQR.estado}</span>
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        Operacion:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.operacion && filterQR.operacion}
                                    </td>
                                </tr>
                                <tr className="bg-white text-[14px] border-b hover:bg-gray-50 " >
                                    <td className="px-3 py-3 text-gray-900 ">
                                        ID de tracking:
                                    </td>
                                    <td className="px-3 py-3 text-gray-900 ">
                                        {filterQR.uuid}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    }






    </div>
    )
}

// {filterQR && <div className='relative h-[450px] overflow-y-auto'>
// <table className=" w-full lg:w-full  lg:min-w-auto text-[14px] text-left text-gray-500 rounded-[20px]">
//         <thead className="text-[14px] text-gray-700 uppercase bg-gray-50  ">
//             <tr>
//                 <th scope="col-3" className="w-1/2 px-3 py-3">
//                     Datos
//                 </th>
//                 <th scope="col" className="px-3 py-3">
//                     Valores
//                 </th>
//             </tr>
//         </thead>
//         <tbody>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >
//                 <td className="px-3 py-4  flex flex-col text-[14px] text-gray-700 ">
//                     Remitente
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     {filterQR && filterQR.remitente}
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >
//                 <td className="px-3 py-4  flex flex-col text-[14px] text-gray-700 ">
//                 Destinatario
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     {filterQR.destinatario && filterQR.destinatario}
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >
//                 <td className="px-3 py-4  flex flex-col text-[14px] text-gray-700 ">
//                     Celular de destinatario
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     {filterQR.celular && filterQR.celular}
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Cuenta de destinatario:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     {filterQR['cuenta destinatario'] && filterQR['cuenta destinatario']}
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >

//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Divisa de envio:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                 {filterQR['divisa de envio'] && filterQR['divisa de envio']}
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >

//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Importe:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     {filterQR.importe}
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >

//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Divisa de receptor:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                 {filterQR['divisa de receptor']}
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >

//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Importe Con el cambio aplicado:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                 {filterQR.cambio}

//                 </td>
//             </tr>
          

//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >

//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Estado:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     En verficación
//                 </td>
//             </tr>
//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >

//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Operacion:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     Envio
//                 </td>
//             </tr>

//             <tr className="bg-white text-[14px] border-b   hover:bg-gray-50 " >

//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     ID de tracking:
//                 </td>
//                 <td className="px-3 py-4 font-semibold text-gray-900 ">
//                     {filterQR.uuid}
//                 </td>
//             </tr>
//         </tbody>
//     </table>
// </div>}
