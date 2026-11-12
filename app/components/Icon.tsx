import type { ReactNode } from "react";

export type IconName =
  | "tent"
  | "backpack"
  | "sleep"
  | "cook"
  | "search"
  | "cart"
  | "menu"
  | "close"
  | "arrow"
  | "truck"
  | "shield"
  | "headset"
  | "return"
  | "user"
  | "logout"
  | "package"
  | "heart"
  | "compare"
  | "phone"
  | "mail"
  | "clock"
  | "lock"
  | "card"
  | "chat"
  | "instagram"
  | "facebook"
  | "youtube";

const paths: Record<IconName, ReactNode> = {
  tent: (
    <>
      <path d="M3 20 12 4l9 16" />
      <path d="M12 4v16M7 20l5-8 5 8" />
    </>
  ),
  backpack: (
    <>
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
      <rect x="5" y="7" width="14" height="14" rx="3" />
      <path d="M8 12h8M8 16h8M5 11H3v5h2m14-5h2v5h-2" />
    </>
  ),
  sleep: (
    <>
      <path d="M8 4h7a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
      <path d="M9 4v17M5 9h4M15 8h.01" />
    </>
  ),
  cook: (
    <>
      <path d="M5 9h14l-1 11H6L5 9Z" />
      <path d="M8 9V6h8v3M3 12h2m14 0h2M9 3h6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.3 10.3a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 2-1.6L20.5 8H6" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  truck: (
    <>
      <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  headset: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5ZM17 20c0 1-1 2-3 2" />
    </>
  ),
  return: (
    <>
      <path d="M4 9h11a5 5 0 0 1 0 10H8" />
      <path d="m8 5-4 4 4 4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5M5 12h11" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.3 3.6 4 7 4c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.8C19.5 15.4 12 20 12 20Z" />
  ),
  compare: (
    <>
      <path d="M6 20V10M12 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  chat: (
    <>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      <path d="M8 11h8M8 14.5h5" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  facebook: (
    <path d="M14 8h3V4h-3a5 5 0 0 0-5 5v3H6v4h3v6h4v-6h3l1-4h-4V9a1 1 0 0 1 1-1Z" />
  ),
  youtube: (
    <>
      <path d="M21 12c0-3.5-.4-5.6-1.2-6.3C19 5 16.5 5 12 5s-7 0-7.8.7C3.4 6.4 3 8.5 3 12s.4 5.6 1.2 6.3C5 19 7.5 19 12 19s7 0 7.8-.7c.8-.7 1.2-2.8 1.2-6.3Z" />
      <path d="m10 9 5 3-5 3V9Z" />
    </>
  ),
};

export default function Icon({
  name,
  className = "h-6 w-6",
  filled = false,
}: {
  name: IconName;
  className?: string;
  /** Залита іконка (напр. сердечко для товару в обраному) */
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
