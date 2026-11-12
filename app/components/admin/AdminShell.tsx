"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "../Auth";
import AuthForms from "../AuthForms";
import Icon, { type IconName } from "../Icon";
import { BrandLogo } from "../SiteHeader";
import { useAdminData } from "./api";

export type AdminSummary = {
  orders: { total: number; byStatus: Record<string, number> };
  revenue: { total: number; last30: number; count30: number };
  products: { total: number; visible: number; outOfStock: number; lowStock: { id: string; name: string; stock: number; category: string }[] };
  messages: { unread: number };
  customers: number;
};

const nav: { href: string; label: string; icon: IconName; badge?: (s: AdminSummary) => number }[] = [
  { href: "/admin", label: "Огляд", icon: "compare" },
  { href: "/admin/products", label: "Товари", icon: "tent", badge: (s) => s.products.outOfStock },
  { href: "/admin/orders", label: "Замовлення", icon: "package", badge: (s) => s.orders.byStatus.new ?? 0 },
  { href: "/admin/messages", label: "Звернення", icon: "chat", badge: (s) => s.messages.unread },
];

/**
 * Каркас адмін-панелі. Доступ: лише користувачі з email у ADMIN_EMAILS.
 * Перевірка також виконується на сервері в кожному запиті до /api/admin/*.
 */
export default function AdminShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { status, user, logout } = useAuth();
  const pathname = usePathname();

  if (status === "loading") {
    return <div className="min-h-screen bg-[#f3f6f9]" aria-label="Завантаження" />;
  }
  if (!user) {
    return (
      <Centered>
        <h1 className="text-2xl font-extrabold tracking-[-0.03em]">Вхід до адмін-панелі</h1>
        <p className="mb-6 mt-1 text-sm text-[#527083]">Увійдіть з акаунтом адміністратора.</p>
        <AuthForms onSuccess={() => undefined} initialMode="login" />
      </Centered>
    );
  }
  if (!user.isAdmin) {
    return (
      <Centered>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fdecec] text-[#c53035]">
          <Icon name="lock" className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-center text-2xl font-extrabold tracking-[-0.03em]">Немає доступу</h1>
        <p className="mt-2 text-center text-sm text-[#527083]">
          Акаунт {user.email} не має прав адміністратора.
        </p>
        <Link href="/" className="mt-6 block rounded-full bg-[#ffd51f] py-3 text-center text-sm font-extrabold transition hover:bg-[#ffe044]">
          На головну
        </Link>
      </Centered>
    );
  }
  return (
    <AdminFrame pathname={pathname} userName={user.firstName} onLogout={logout} title={title} actions={actions}>
      {children}
    </AdminFrame>
  );
}

function AdminFrame({
  pathname,
  userName,
  onLogout,
  title,
  actions,
  children,
}: {
  pathname: string;
  userName: string;
  onLogout: () => void;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { data: summary } = useAdminData<AdminSummary>(`/api/admin/summary?p=${encodeURIComponent(pathname)}`);
  return (
    <div className="min-h-screen bg-[#f3f6f9] text-[#082c45]">
      <header className="sticky top-0 z-40 bg-[#082c45] text-white">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-5 py-3 lg:px-8">
          <Link href="/admin" className="flex items-center gap-3">
            <BrandLogo />
            <span className="leading-tight">
              <span className="block text-[15px] font-extrabold">family camping</span>
              <span className="block text-xs font-bold text-[#ffd51f]">Адмін-панель</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/" target="_blank" className="hidden items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold transition hover:bg-white/20 sm:inline-flex">
              На сайт <Icon name="arrow" className="h-4 w-4 -rotate-45" />
            </Link>
            <span className="hidden text-sm text-white/70 md:inline">{userName}</span>
            <button onClick={onLogout} aria-label="Вийти" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:px-8">
        <nav aria-label="Розділи адмін-панелі" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-1.5 overflow-x-auto rounded-[20px] bg-white p-2 shadow-[0_10px_30px_rgba(79,93,101,.08)] lg:grid">
            {nav.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const badge = summary && item.badge ? item.badge(summary) : 0;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-sm font-bold transition ${
                      active ? "bg-[#082c45] text-white" : "text-[#264e65] hover:bg-[#eef6fb]"
                    }`}
                  >
                    <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-[#ffd51f]" : "text-[#067eb7]"}`} />
                    {item.label}
                    {badge > 0 && (
                      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#ffd51f] px-1.5 text-[11px] font-black text-[#082c45]">
                        {badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-[-0.04em]">{title}</h1>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f3f6f9] px-5 py-10 text-[#082c45]">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[0_18px_52px_rgba(79,93,101,.12)]">
        <div className="mb-6 flex items-center gap-3">
          <BrandLogo />
          <span className="text-sm font-extrabold">family camping · адмін</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Картка-контейнер у стилі сайту */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[22px] bg-white p-5 shadow-[0_10px_30px_rgba(79,93,101,.08)] sm:p-6 ${className}`}>{children}</section>;
}

/** Повідомлення про помилку завантаження з кнопкою повтору */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel className="text-center">
      <p className="font-bold text-[#c53035]">{message}</p>
      <button onClick={onRetry} className="mt-3 text-sm font-extrabold text-[#098fd0] hover:underline">
        Спробувати ще раз
      </button>
    </Panel>
  );
}
