'use client'

import {
  onAuthStateChanged,
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { readUserData } from "./database";

function getClientAuth() {
  try {
    return getAuth()
  } catch {
    return null
  }
}

function onAuth(setUserProfile, setUserData) {
  const auth = getClientAuth()
  if (!auth) return () => {}

  let unsubscribeUserDb = null
  let retryTimer = null

  const cleanupUserDb = () => {
    if (typeof unsubscribeUserDb === 'function') {
      unsubscribeUserDb()
      unsubscribeUserDb = null
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  const subscribeUserDb = (user, retry = 0) => {
    cleanupUserDb()
    unsubscribeUserDb = readUserData(
      `usuarios/${user.uid}`,
      setUserData,
      undefined,
      async (error) => {
        const code = String(error?.code || '').trim().toLowerCase()
        if (code === 'permission_denied' && retry < 3) {
          setUserData(undefined)
          try {
            await user.getIdToken(true)
          } catch {}
          retryTimer = setTimeout(() => {
            retryTimer = null
            subscribeUserDb(user, retry + 1)
          }, 400 * (retry + 1))
          return
        }

        setUserData(null)
      }
    )
  }

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    cleanupUserDb()

    if (user) {
      setUserProfile(user)
      setUserData(undefined)
      subscribeUserDb(user)
    } else {
      setUserProfile(null)
      setUserData(undefined)
    }
  });

  return () => {
    cleanupUserDb()
    unsubscribeAuth()
  }
}

// ---------------------------Login, Sign Up and Sign In------------------------------------

async function signUpWithEmail(email, password, setUserProfile, setUserSuccess, callback) {
  try {
    const auth = getClientAuth()
    if (!auth) throw new Error('Auth not initialized')

    const res = await createUserWithEmailAndPassword(auth, email, password)
    const user = res.user;
    setUserProfile(user)

    try {
      await sendEmailVerification(user)
      if (typeof setUserSuccess === 'function') setUserSuccess('EmailVerificationSent')
    } catch { }
    callback && callback !== undefined ? callback(false) : ''
  } catch (error) {
    console.log(error)
    const errorMessage = error.code || error.message;
    setUserProfile(null)
    setUserSuccess(errorMessage)
    callback && callback !== undefined ? callback(true) : ''
  }
}

async function signInWithEmail(email, password, setUserProfile, setUserSuccess, callback) {
  try {
    const auth = getClientAuth()
    if (!auth) throw new Error('Auth not initialized')

    const res = await signInWithEmailAndPassword(auth, email, password)
    setUserProfile(res.user)
    if (typeof setUserSuccess === 'function') setUserSuccess('LoginSuccess')
    if (typeof callback === 'function') callback(res.user)
  } catch (error) {
    if (typeof setUserSuccess === 'function') setUserSuccess(error.code || error.message)
    setUserProfile(null)
  }
}

function sendPasswordReset(email, callback) {
  const auth = getClientAuth()
  if (!auth) return

  sendPasswordResetEmail(auth, email)
    .then(() => {
      callback()
    })
    .catch((error) => {
      console.log(error)
    });
}

function handleSignOut() {
  const auth = getClientAuth()
  if (!auth) return

  signOut(auth).catch((error) => {
    console.log(error)
  });
}

export { onAuth, signUpWithEmail, signInWithEmail, handleSignOut, sendPasswordReset }

