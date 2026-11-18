"use client";

import { useState } from "react";

/**
 * «Скасувати замовлення» з підтвердженням — для покупця, доки замовлення не оплачене.
 * phone — для гостя (сторінка «Де моє замовлення?»); з акаунтом не потрібен
 */
export default function CancelOrder({
  number,
  phone,
  onCancelled,
}: {
  number: string;
  phone?: string;
  onCancelled: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const cancel = async () => {
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не вдалося скасувати замовлення");
      setAsking(false);
      onCancelled();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="rounded-full px-4 py-2 text-xs font-extrabold text-[#c53035] transition hover:bg-[#fdecec]"
      >
        Скасувати замовлення
      </button>
    );

  return (
    <span role="group" aria-label="Підтвердження скасування" className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#fdecec] px-3 py-2 text-xs text-[#3d5d70]">
      <span>Скасувати замовлення {number}?</span>
      <button type="button" onClick={cancel} disabled={pending} className="rounded-full bg-[#c53035] px-3 py-1.5 font-extrabold text-white disabled:opacity-60">
        {pending ? "Скасовуємо…" : "Так, скасувати"}
      </button>
      <button type="button" onClick={() => { setAsking(false); setError(""); }} className="rounded-full px-3 py-1.5 font-extrabold text-[#264e65] hover:bg-white">
        Ні
      </button>
      {error && <span role="alert" className="w-full font-semibold text-[#c53035]">{error}</span>}
    </span>
  );
}
