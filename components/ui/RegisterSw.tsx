"use client";

import { useEffect } from "react";

export default function RegisterSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}