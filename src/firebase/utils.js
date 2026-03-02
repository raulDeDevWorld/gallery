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

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (typeof unsubscribeUserDb === 'function') {
      unsubscribeUserDb()
      unsubscribeUserDb = null
    }

    if (user) {
      setUserProfile(user)
      setUserData(undefined)
      unsubscribeUserDb = readUserData(`usuarios/${user.uid}`, setUserData)
    } else {
      setUserProfile(null)
      setUserData(undefined)
    }
  });

  return () => {
    if (typeof unsubscribeUserDb === 'function') unsubscribeUserDb()
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

