"use client";

import { QRCodeSVG } from "qrcode.react";
import Modal from "@/components/ui/Modal";
import type { BusinessConfig } from "@/lib/types/domain";
import { buildWaLink } from "../lib/helpers";

/** Modal con el QR del tiquete y accesos rápidos a WhatsApp / vista pública. */
export default function QrModal({ order, config, slug, onClose }: { order: any; config: BusinessConfig; slug: string; onClose: () => void }) {
  const url = order
    ? `${window.location.origin}/tiquete?number=${encodeURIComponent(String(order.order_number))}&slug=${encodeURIComponent(slug)}`
    : "";
  const wa = order ? buildWaLink(order, "default", config, slug) : "";
  return (
    <Modal
      open
      onClose={onClose}
      title={`Tiquete Digital #${order?.order_number}`}
      className="max-w-sm"
      footer={
        <div className="flex w-full flex-wrap justify-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white">
            🌐 Ver Tiquete
          </a>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-success-600 px-3 py-2 text-sm font-bold text-white">
            📱 WhatsApp
          </a>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">
            Cerrar
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">Cliente: <strong className="text-slate-900">{order?.customer_name}</strong></p>
      <div className="mt-3 flex justify-center rounded-xl bg-slate-50 p-4">
        <QRCodeSVG value={url} size={200} fgColor="#101828" bgColor="#ffffff" level="M" />
      </div>
      <p className="mt-2 text-center text-xs font-extrabold text-success-700">📸 Apunta la cámara → Ver tu recibo digital</p>
    </Modal>
  );
}
