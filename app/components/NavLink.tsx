"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { isSamePageLink } from "./nav-utils";

/**
 * Плавно на початок сторінки. На телефонах плавна прокрутка часто
 * переривається (інерція після свайпу, адресний рядок) і зупиняється
 * посередині — тоді «доводимо» миттєво.
 */
function scrollToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("scrollend", finish);
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
  };
  window.addEventListener("scrollend", finish);
  // Браузери без scrollend — запасний таймер
  window.setTimeout(finish, 1200);
}

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
    scrollToTop();
    // Прибираємо якір (#reviews тощо), щоб адреса відповідала положенню
    if (window.location.hash) history.replaceState(history.state, "", window.location.pathname + window.location.search);
  };

  return <Link {...props} onClick={handleClick} />;
}
