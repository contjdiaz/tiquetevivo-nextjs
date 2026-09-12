"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { compressImage } from "@/lib/client";

/** Modal opcional para adjuntar la foto de evidencia al confirmar una entrega. */
export default function DeliveryPhotoModal({ onConfirm, onSkip }: { onConfirm: (photo: string | null) => void; onSkip: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onSkip}
      title="📸 Foto de entrega"
      className="max-w-sm"
      footer={
        <div className="flex w-full gap-2">
          <button onClick={onSkip} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-600">
            Omitir
          </button>
          <button onClick={() => onConfirm(photo)} className="flex-1 rounded-lg bg-brand-600 px-3 py-2 font-bold text-white">
            Confirmar entrega
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">Opcional: adjunta una foto del pedido entregado. Puedes omitir este paso.</p>
      {photo ? (
        <div className="relative mt-3">
          <img src={photo} alt="Vista previa entrega" className="max-h-64 w-full rounded-lg object-cover" />
          <button type="button" aria-label="Quitar foto" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-slate-900/70 text-white" onClick={() => setPhoto(null)}><span aria-hidden="true">✕</span></button>
        </div>
      ) : (
        <label className="mt-3 block cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
          📷 Tomar foto / Elegir imagen
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setPhoto(await compressImage(file, 800, 0.8));
              } catch { /* ignore */ }
              e.target.value = "";
            }}
          />
        </label>
      )}
    </Modal>
  );
}
