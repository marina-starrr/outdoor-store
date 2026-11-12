import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

/* Будівельні блоки інформаційних сторінок — без стану, рендеряться на сервері */

export function InfoCard({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-28 rounded-[24px] bg-white p-6 shadow-[0_18px_52px_rgba(79,93,101,.08)] sm:p-8 ${className}`}>
      {children}
    </section>
  );
}

export function InfoTitle({ icon, eyebrow, children }: { icon?: IconName; eyebrow?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      {icon && (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eef6fb] text-[#067eb7]">
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="text-2xl font-extrabold tracking-[-0.03em] sm:text-[1.7rem]">{children}</h2>
      </div>
    </div>
  );
}

/** Звичайний текст сторінки */
export function Prose({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-3 text-[15px] leading-relaxed text-[#3d5d70] [&_b]:text-[#082c45] [&_a]:font-bold [&_a]:text-[#098fd0] [&_a:hover]:underline [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:marker:text-[#1eb6ed] ${className}`}>
      {children}
    </div>
  );
}

/** Нумеровані кроки (порядок дій) */
export function Steps({ items }: { items: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="mt-6 grid gap-4 md:grid-cols-2">
      {items.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 rounded-[20px] border border-[#e3edf3] p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ffd51f] text-base font-black text-[#082c45]">
            {i + 1}
          </span>
          <span>
            <b className="block">{s.title}</b>
            <span className="mt-1 block text-sm leading-relaxed text-[#527083]">{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Питання-відповіді на нативних <details> — працюють без JavaScript */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="mt-5 divide-y divide-[#e3edf3] rounded-[20px] border border-[#e3edf3]">
      {items.map((it) => (
        <details key={it.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold">
            {it.q}
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef6fb] text-lg text-[#067eb7] transition group-open:rotate-45">+</span>
          </summary>
          <div className="pb-5 text-sm leading-relaxed text-[#3d5d70]">{it.a}</div>
        </details>
      ))}
    </div>
  );
}

/** Акцентна плашка */
export function Callout({
  tone = "yellow",
  icon,
  title,
  children,
}: {
  tone?: "yellow" | "blue" | "green";
  icon?: IconName;
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    yellow: "bg-[#fffbe6] [&_.ico]:bg-[#ffd51f] [&_.ico]:text-[#082c45]",
    blue: "bg-[#eef6fb] [&_.ico]:bg-white [&_.ico]:text-[#067eb7]",
    green: "bg-[#e7f7ee] [&_.ico]:bg-white [&_.ico]:text-[#1f9d55]",
  };
  return (
    <div className={`flex gap-4 rounded-[20px] p-5 ${tones[tone]}`}>
      {icon && (
        <span className="ico grid h-10 w-10 shrink-0 place-items-center rounded-full">
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
      <div className="text-sm leading-relaxed text-[#3d5d70] [&_a]:font-bold [&_a]:text-[#098fd0] [&_a:hover]:underline [&_b]:text-[#082c45]">
        {title && <p className="mb-1 text-base font-extrabold text-[#082c45]">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** Цифри в банері */
export function BannerStats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-3 sm:gap-4">
      {items.map((s) => (
        <div key={s.label} className="min-w-0 rounded-[20px] bg-white/12 px-4 py-4 text-center ring-1 ring-white/20 backdrop-blur sm:min-w-[130px] sm:px-5">
          <dt className="sr-only">{s.label}</dt>
          <dd className="text-2xl font-black tracking-[-0.03em] text-[#ffff00] sm:text-3xl">{s.value}</dd>
          <dd className="mt-1 text-xs font-bold text-white/80">{s.label}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Зміст сторінки — якорі на розділи (для довгих юридичних текстів) */
export function Toc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Зміст" className="rounded-[24px] bg-white p-6 shadow-[0_18px_52px_rgba(79,93,101,.08)]">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8aa5b5]">Зміст</p>
      <ol className="mt-3 grid gap-x-8 gap-y-2 text-sm font-bold sm:grid-cols-2">
        {items.map((it, i) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className="flex gap-2 text-[#264e65] transition hover:text-[#098fd0]">
              <span className="text-[#1eb6ed]">{String(i + 1).padStart(2, "0")}</span> {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
