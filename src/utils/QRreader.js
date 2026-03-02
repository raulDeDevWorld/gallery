import qrcodeParser from "qrcode-parser";

async function QRreaderUtils(e, setFilterQR, setFilter, readUserData, setPendienteDB) {

    const res = await qrcodeParser(e.target.files[0])
    setFilterQR(res);
    console.log(res)
    await readUserData(res, setPendienteDB)
}

export { QRreaderUtils }