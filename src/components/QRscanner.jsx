'use client'

// import { QrScanner } from '@yudiel/react-qr-scanner';
import { useUser } from '@/context'
import { readUserData } from '@/firebase/database'

const Component = () => {
  const { setPendienteDB, setWebScann, setFilter, setFilterQR} = useUser()

  const handlerQR = async (result) => {
    if (result) {
      console.log(result)
      readUserData(result, setPendienteDB)
      setFilterQR(result)
      setWebScann(false)
    }
  }

  return (
    <></>
    // <QrScanner
    //   // constraints={{
    //   //   facingMode: 'environment'
    //   // }}
    //   onDecode={(result) => handlerQR(result)}
    //   onError={(error) => console.log(error?.message)}
    // />
  );
}
export default Component                                           