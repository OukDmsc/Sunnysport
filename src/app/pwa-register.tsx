"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("The SUNNY SPORT CLUB service worker could not be registered:", error);
      });
    }
  }, []);

  return null;
}
