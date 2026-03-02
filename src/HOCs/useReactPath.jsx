'use client'
import { useEffect, useState } from 'react'

const useReactPath = () => {
    const [path, setPath] = useState();
    const listenToPopstate = () => {
      const winPath = window.location.href;
      setPath(winPath);
    };
    useEffect(() => {
      window.addEventListener("popstate", listenToPopstate);
      return () => {
        window.removeEventListener("popstate", listenToPopstate);
      };
    }, []);
    return path;
  };

  export { useReactPath }