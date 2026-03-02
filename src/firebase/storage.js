import { app } from './config'
import { getStorage, ref, uploadBytes, getDownloadURL, listAll, getBlob } from "firebase/storage";
import { writeUserData } from './database'

import imageCompression from 'browser-image-compression';

const storage = getStorage(app)

//--------------------------- Firebase Storage ---------------------------
async function uploadImage(storagePath, file) {
    const imagesRef = ref(storage, storagePath);

    const options = {
        maxWidthOrHeight: 500,
        maxSizeMB: 0.07,
        alwaysKeepResolution: true,
        useWebWorker: true,
        maxIteration: 300,
        fileType: 'image/webp'
    }

    const compressedFile = file?.type != 'image/gif' ? await imageCompression(file, options) : file
    const snapshot = await uploadBytes(imagesRef, compressedFile)
    return getDownloadURL(ref(storage, snapshot.metadata.fullPath))
}

async function uploadStorage(ruteDB, file, db, callback, setUserData, setUserSuccess) {
    const url = await uploadImage(ruteDB, file)
    const obj = { url }
    if (typeof setUserData === 'function' && typeof setUserSuccess === 'function') {
        return writeUserData(ruteDB, { ...db, ...obj }, setUserData, setUserSuccess, callback)
    }
    return writeUserData(ruteDB, { ...db, ...obj }, callback)
}

function downloadFile(path) {

    getDownloadURL(ref(storage, path))
    .then((url) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'blob';
      xhr.onload = (event) => {
        const blob = xhr.response;
        console.log(blob)
      };
      xhr.open('GET', url);
      xhr.send();
  
    })
    .catch((error) => {
      // Handle any errors
    });




    // getBlob(ref(storage, path))
    //     .then((blob) => {
    //        return console.log(blob)
    //     })
    //     .catch((err) => {
    //        return console.log(err)
    //     })
}




export { uploadStorage, uploadImage, downloadFile }
