"use client";

import { useEffect } from "react";

// WAJIB GANTI: Tiap kali lu ada update besar di GitHub, ubah angka ini (misal ke "v1.1", lalu "v1.2", dst)
const CURRENT_APP_VERSION = "v1.0"; 

export default function AutoUpdateChecker() {
  useEffect(() => {
    // Ambil catatan versi yang kesimpen di HP admin saat ini
    const savedVersion = localStorage.getItem("smpt_app_version");

    // Kalau versinya beda (atau belum pernah disimpen), paksa bersihin cache
    if (savedVersion !== CURRENT_APP_VERSION) {
      const forceUpdate = async () => {
        if ("caches" in window) {
          try {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((name) => caches.delete(name)));
          } catch (err) {
            console.error("Gagal clear cache:", err);
          }
        }
        
        // Simpan versi terbaru biar nggak terjadi reload terus-terusan berulang
        localStorage.setItem("smpt_app_version", CURRENT_APP_VERSION);
        
        // Paksa reload halaman narik dari server Vercel terbaru
        window.location.reload();
      };

      forceUpdate();
    }
  }, []);

  return null; // Nggak merender apa-apa di UI (siluman)
}
