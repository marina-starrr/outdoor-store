"use client";

import Link from "./NavLink";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./Auth";
import { useCart } from "./Cart";
import { useLists } from "./Lists";
import Icon, { type IconName } from "./Icon";
import { navLinks } from "./data";
import HeaderSearch from "./HeaderSearch";

export function BrandLogo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box =
    size === "lg" ? "h-12 w-12 rounded-[15px]" : "h-11 w-11 rounded-[14px]";
  return (
    <span
      className={`grid ${box} place-items-center bg-[#ffff00] transition-transform group-hover:-rotate-3`}
    >
      <span className="brand-mark h-7 w-7" aria-hidden="true" />
    </span>
  );
}

function HeaderIconLink({
  href,
  icon,
  count,
  label,
  active,
  className = "grid",
}: {
  href: string;
  icon: IconName;
  count: number;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label.split(",")[0]}
      className={`relative ${className} h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7] transition hover:bg-[#dff4ff] ${active ? "ring-2 ring-[#098fd0] ring-offset-2" : ""}`}
    >
      <Icon name={icon} className="h-[22px] w-[22px]" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ffd51f] px-1 text-[10px] font-black text-[#082c45]">
          {count}
        </span>
      )}
    </Link>
  );
}

type SiteHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearchFocus?: () => void;
  /** Enter у полі пошуку (напр. перехід до каталогу з результатами) */
  onSearchSubmit?: (query: string) => void;
};

export default function SiteHeader({
  query,
  onQueryChange,
  onSearchFocus,
  onSearchSubmit,
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { count, openCart } = useCart();
  const { user } = useAuth();
  const { favorites, compare } = useLists();
  const pathname = usePathname();

  return (
    <>
      <div className="bg-[#067eb7] px-5 py-2.5 text-center text-xs font-bold tracking-wide text-white sm:text-sm">
        Безкоштовна доставка по Україні від 3 000 ₴
      </div>

      <header className="sticky top-0 z-50 border-b border-sky-100 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2 bg-white px-4 py-4 min-[400px]:gap-2.5 min-[400px]:px-5 sm:gap-4 lg:px-8 xl:gap-5">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2 min-[400px]:gap-2.5"
            aria-label="На головну"
          >
            <BrandLogo />
            <span className="text-[13px] font-extrabold leading-[1.05] min-[400px]:text-[15px]">
              family
              <span className="block text-[#00acff]">camping</span>
            </span>
          </Link>

          <nav
            className="ml-5 hidden items-center gap-7 text-sm font-bold xl:flex"
            aria-label="Головна навігація"
          >
            {navLinks.map((link) => {
              const active =
                link.href === pathname ||
                (link.href.startsWith("/") &&
                  !link.href.includes("#") &&
                  pathname.startsWith(`${link.href}/`));
              return (
                <Link
                  key={link.href}
                  className={`nav-link ${active ? "!text-[#098fd0]" : ""}`}
                  aria-current={active ? "page" : undefined}
                  href={link.href}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="relative ml-auto hidden max-w-md flex-1 md:block">
            <HeaderSearch query={query} onQueryChange={onQueryChange} onFocus={onSearchFocus} onSubmit={onSearchSubmit} />
          </div>

          <Link
            href="/account"
            aria-label={user ? `Профіль: ${user.firstName}` : "Увійти в акаунт"}
            title={user ? `${user.firstName} ${user.lastName}`.trim() : "Увійти"}
            className={`ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full transition md:ml-0 ${
              user
                ? "bg-[#ffd51f] text-[15px] font-black text-[#082c45] hover:bg-[#ffe044]"
                : "bg-[#eef9ff] text-[#067eb7] hover:bg-[#dff4ff]"
            } ${pathname === "/account" ? "ring-2 ring-[#098fd0] ring-offset-2" : ""}`}
          >
            {user ? (
              user.firstName.charAt(0).toUpperCase()
            ) : (
              <Icon name="user" className="h-[22px] w-[22px]" />
            )}
          </Link>

          {compare.length > 0 && (
            <HeaderIconLink
              href="/compare"
              icon="compare"
              count={compare.length}
              label={`Порівняння, товарів: ${compare.length}`}
              active={pathname === "/compare"}
              className="hidden sm:grid"
            />
          )}
          <HeaderIconLink
            href="/favorites"
            icon="heart"
            count={favorites.length}
            label={`Обране, товарів: ${favorites.length}`}
            active={pathname === "/favorites"}
          />

          <button
            onClick={() =>
              pathname === "/cart"
                ? window.scrollTo({ top: 0, behavior: "smooth" })
                : openCart()
            }
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eef9ff] text-[#087caf] transition hover:bg-[#dff4ff]"
            aria-label={`Кошик, товарів: ${count}`}
            aria-haspopup="dialog"
          >
            <Icon name="cart" className="h-6 w-6 text-[#067eb7]" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ffd51f] px-1 text-[10px] font-black text-[#082c45]">
                {count}
              </span>
            )}
          </button>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00acff] text-white xl:hidden"
            aria-label={menuOpen ? "Закрити меню" : "Відкрити меню"}
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "close" : "menu"} className="h-6 w-6" />
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-sky-100 bg-white px-5 py-5 xl:hidden">
            <div className="mb-5 md:hidden">
              <HeaderSearch variant="mobile" query={query} onQueryChange={onQueryChange} onFocus={onSearchFocus} onSubmit={onSearchSubmit && ((q) => { setMenuOpen(false); onSearchSubmit(q); })} />
            </div>
            <nav className="grid gap-1 font-bold">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 hover:bg-sky-50"
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-2 h-px bg-sky-100" />
              {[
                { href: "/favorites", label: "Обране", icon: "heart" as const, count: favorites.length },
                { href: "/compare", label: "Порівняння", icon: "compare" as const, count: compare.length },
                { href: "/account", label: user ? "Мій профіль" : "Увійти", icon: "user" as const, count: 0 },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-sky-50"
                >
                  <Icon name={item.icon} className="h-5 w-5 text-[#067eb7]" />
                  {item.label}
                  {item.count > 0 && (
                    <span className="ml-auto rounded-full bg-[#ffd51f] px-2 py-0.5 text-xs font-black">{item.count}</span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
