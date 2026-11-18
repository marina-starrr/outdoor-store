"use client";

import type { ReactNode } from "react";
import { openChat } from "./ChatWidget";
import Icon from "./Icon";

/** Кнопка, що відкриває чат з консультантом (з прикріпленим товаром, якщо задано) */
export default function ChatButton({
  productId,
  className,
  children,
}: {
  productId?: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={() => openChat({ productId })} className={className}>
      <Icon name="chat" className="h-5 w-5 shrink-0" />
      {children}
    </button>
  );
}
