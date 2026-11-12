"use client";

import Link from "./NavLink";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs } from "./catalog-ui";
import { contacts, infoLinks } from "./data";

/**
 * Спільний каркас інформаційних сторінок (Про нас, Контакти, Доставка,
 * Повернення, Політика): банер у стилі сайту, бічна навігація між
 * сторінками та картка «Потрібна допомога?».
 */
export default function InfoLayout({
  eyebrow,
  icon,
  title,
  accent,
  lead,
  aside,
  updated,
  children,
}: {
  eyebrow: string;
  icon: IconName;
  /** Заголовок; `accent` — виділене жовтим слово після нього */
  title: string;
  accent?: string;
  lead: string;
  /** Блок праворуч у банері (цифри, бейджі) */
  aside?: ReactNode;
  /** Дата останнього оновлення (для юридичних сторінок) */
  updated?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const crumb = infoLinks.find((l) => l.href === pathname)?.label ?? title;

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)}
      />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#067eb7_0%,#1eb6ed_100%)] text-white">
          <div className="pointer-events-none absolute -right-24 -top-32 -z-10 h-[420px] w-[420px] rounded-full bg-[#ffd51f]/30 blur-[100px]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-40 left-10 -z-10 h-80 w-80 rounded-full bg-white/15 blur-[90px]" aria-hidden="true" />
          <div className="mx-auto max-w-[1440px] px-5 pb-20 pt-6 lg:px-8 lg:pb-24">
            <div className="[&_a]:text-white/75 [&_a:hover]:text-white [&_li]:text-white/75 [&_span[aria-current]]:text-white">
              <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: crumb }]} />
            </div>
            <div className="mt-8 grid items-end gap-10 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] backdrop-blur">
                  <Icon name={icon} className="h-4 w-4" /> {eyebrow}
                </p>
                <h1 className="mt-5 text-[clamp(2.4rem,5.5vw,4.4rem)] font-black leading-[0.98] tracking-[-0.055em]">
                  {title} {accent && <span className="text-[#ffff00]">{accent}</span>}
                </h1>
                <p className="mt-4 max-w-2xl text-lg font-medium text-white/85">{lead}</p>
                {updated && <p className="mt-3 text-sm text-white/70">Оновлено: {updated}</p>}
              </div>
              {aside}
            </div>
          </div>
        </section>

        <div className="relative z-10 mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-5 pb-20 lg:grid-cols-[270px_minmax(0,1fr)] lg:items-start lg:px-8">
          <aside className="-mt-10 grid min-w-0 grid-cols-1 gap-4 lg:sticky lg:top-28">
            <nav aria-label="Інформація для покупців" className="rounded-[24px] bg-white p-3 shadow-[0_18px_52px_rgba(79,93,101,.1)]">
              <p className="px-3 pb-2 pt-1 text-xs font-black uppercase tracking-[0.14em] text-[#8aa5b5]">Покупцям</p>
              <ul className="flex gap-1 overflow-x-auto lg:grid lg:overflow-visible">
                {infoLinks.map((l) => {
                  const active = l.href === pathname;
                  return (
                    <li key={l.href} className="shrink-0">
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                          active ? "bg-[#082c45] text-white" : "text-[#264e65] hover:bg-[#eef6fb]"
                        }`}
                      >
                        {l.label}
                        <Icon name="arrow" className={`hidden h-4 w-4 lg:block ${active ? "text-[#ffd51f]" : "text-[#b6cbd8]"}`} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {pathname !== "/contacts" && (
              <div className="hidden rounded-[24px] bg-[#082c45] p-6 text-white lg:block">
                <p className="text-lg font-extrabold">Потрібна допомога?</p>
                <p className="mt-1.5 text-sm text-white/70">Відповімо на будь-яке питання про замовлення чи спорядження.</p>
                <a href={contacts.phoneHref} className="mt-4 flex items-center gap-2.5 font-extrabold hover:text-[#ffd51f]">
                  <Icon name="phone" className="h-5 w-5 text-[#3ed8ff]" /> {contacts.phone}
                </a>
                <a href={contacts.emailHref} className="mt-2 flex items-center gap-2.5 text-sm font-bold hover:text-[#ffd51f]">
                  <Icon name="mail" className="h-5 w-5 text-[#3ed8ff]" /> {contacts.email}
                </a>
                <Link href="/contacts" className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[#ffd51f] py-3 text-sm font-extrabold text-[#082c45] transition hover:bg-[#ffe044]">
                  Написати нам <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
            )}
          </aside>

          <div className="grid min-w-0 grid-cols-1 gap-6 lg:-mt-10">{children}</div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
