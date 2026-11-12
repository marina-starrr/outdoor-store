"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { isSamePageLink } from "./nav-utils";

/**
 * Посилання для меню та футера. Якщо користувач уже на цій сторінці,
 * клік не «мертвий» — сторінка плавно прокручується на початок.
 */
export default function NavLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  const href = typeof props.href === "string" ? props.href : (props.href.pathname ?? "");

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Ctrl/Cmd/Shift-клік — нова вкладка, як звичайно
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isSamePageLink(href, window.location.pathname)) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // Прибираємо якір (#reviews тощо), щоб адреса відповідала положенню
    if (window.location.hash) history.replaceState(history.state, "", window.location.pathname + window.location.search);
  };

  return <Link {...props} onClick={handleClick} />;
}
