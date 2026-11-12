"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { categories } from "./catalog-data";

/** Сторінка 404 у стилі сайту: пошук і популярні категорії замість глухого кута */
export default function NotFoundView() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const toCatalog = (q: string) => router.push(`/catalog?q=${encodeURIComponent(q)}`);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader query={query} onQueryChange={setQuery} onSearchSubmit={toCatalog} />
      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#067eb7_0%,#1eb6ed_100%)] text-white">
          <div className="pointer-events-none absolute -right-24 -top-32 -z-10 h-[420px] w-[420px] rounded-full bg-[#ffd51f]/30 blur-[100px]" aria-hidden="true" />
          <div className="mx-auto max-w-[1440px] px-5 py-16 text-center lg:px-8 lg:py-24">
            <p className="text-[clamp(5rem,16vw,10rem)] font-black leading-none tracking-[-0.06em] text-[#ffff00]">404</p>
            <h1 className="mt-4 text-[clamp(1.8rem,4vw,3rem)] font-black tracking-[-0.04em]">Сторінку не знайдено</h1>
            <p className="mx-auto mt-3 max-w-xl text-lg font-medium text-white/85">
              Можливо, товар зняли з продажу або в адресі помилка. Спробуйте пошук — або зазирніть у категорії нижче.
            </p>
            <form
              className="mx-auto mt-8 flex max-w-lg gap-2 rounded-full bg-white p-1.5 shadow-[0_18px_50px_rgba(8,44,69,.25)]"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) toCatalog(query.trim());
              }}
            >
              <label className="sr-only" htmlFor="nf-search">Пошук товарів</label>
              <input
                id="nf-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Наприклад, намет на 4 особи"
                className="min-w-0 flex-1 rounded-full bg-transparent px-5 text-sm text-[#082c45] outline-none"
              />
              <button className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-5 py-3 text-sm font-extrabold text-[#082c45] transition hover:bg-[#ffe044]">
                <Icon name="search" className="h-4 w-4" /> Знайти
              </button>
            </form>
          </div>
        </section>
        <div className="mx-auto max-w-[1440px] px-5 py-14 lg:px-8">
          <h2 className="text-2xl font-extrabold tracking-[-0.03em]">Популярні категорії</h2>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/catalog/${c.slug}`}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-[0_6px_20px_rgba(79,93,101,.08)] transition hover:-translate-y-0.5 hover:text-[#098fd0]"
              >
                {c.name}
              </Link>
            ))}
          </div>
          <Link href="/" className="mt-8 inline-flex items-center gap-2 font-extrabold text-[#098fd0] hover:underline">
            <Icon name="arrow" className="h-4 w-4 rotate-180" /> На головну
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
