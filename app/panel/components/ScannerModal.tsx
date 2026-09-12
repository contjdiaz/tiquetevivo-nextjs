"use client";

import { useEffect, useRef, useState } from "react";

/** Modal de escaneo de QR de entrega con fallback manual cuando no hay `BarcodeDetector`. */
export default function ScannerModal({ onDetect, onClose }: { onDetect: (payload: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const det: any = (typeof window !== "undefined" && (window as any).BarcodeDetector) ? new (window as any).BarcodeDetector({ formats: ["qr_code"] }) : null;
    detectorRef.current = det;
    if (!det) {
      setSupported(false);
      return;
    }
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        runningRef.current = true;
        tick();
      })
      .catch(() => setSupported(false));
    return () => {
      active = false;
      runningRef.current = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tick() {
    if (!runningRef.current || !detectorRef.current || !videoRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length > 0 && codes[0].rawValue) {
        runningRef.current = false;
        onDetect(codes[0].rawValue);
        return;
      }
    } catch { /* ignore */ }
    window.setTimeout(tick, 250);
  }

  function submitManual() {
    const v = manual.trim();
    if (v) onDetect(v);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 lg:items-center lg:p-4">
      <div className="card max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl lg:max-w-md lg:rounded-2xl">
        <div className="flex items-center justify-between">
          <strong className="text-lg text-slate-900">📸 Escanear QR de Entrega</strong>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><span aria-hidden="true">✕</span></button>
        </div>
        {supported ? (
          <div className="mt-3 overflow-hidden rounded-xl bg-slate-900">
            <video ref={videoRef} muted playsInline className="h-64 w-full object-cover" />
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-center">
            <p className="font-extrabold text-warning-800">⚠️ Cámara no disponible</p>
            <p className="mt-1 text-sm text-warning-900">
              Escribe el número de tiquete o pega el contenido del QR en el campo de abajo.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs font-bold text-slate-600">¿El QR no se detecta? Escríbelo aquí:</p>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="#8707 o URL del tiquete"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        <button onClick={submitManual} className="mt-2 w-full rounded-lg bg-slate-900 px-4 py-2 font-bold text-white">
          Buscar
        </button>
      </div>
    </div>
  );
}
