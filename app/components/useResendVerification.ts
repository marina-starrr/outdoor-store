"use client";

import { useCallback, useState } from "react";

export type ResendState = "idle" | "pending" | "sent" | "no-mail" | "error";

/** «Надіслати лист підтвердження ще раз» — для профілю й адмін-панелі */
export function useResendVerification() {
  const [state, setState] = useState<ResendState>("idle");
  const [message, setMessage] = useState("");

  const resend = useCallback(async () => {
    setState("pending");
    try {
      const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setMessage(data.error);
        setState("error");
      } else setState(data.mailEnabled === false ? "no-mail" : "sent");
    } catch {
      setMessage("Немає з'єднання з сервером.");
      setState("error");
    }
  }, []);

  return { state, message, resend };
}
