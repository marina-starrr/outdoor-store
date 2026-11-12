/** Заглушка на час першого рендеру сторінки (напр. щойно доданий товар) */
export default function PageSkeleton() {
  return (
    <div className="min-h-screen bg-[#f7fafc]" aria-busy="true" aria-label="Завантаження">
      <div className="h-10 bg-[#067eb7]" />
      <div className="h-[77px] border-b border-sky-100 bg-white" />
      <div className="mx-auto grid max-w-[1440px] gap-8 px-5 pt-10 lg:grid-cols-2 lg:px-8">
        <div className="aspect-[3/2] animate-pulse rounded-[28px] bg-white" />
        <div className="grid content-start gap-4">
          <div className="h-4 w-32 animate-pulse rounded-full bg-white" />
          <div className="h-10 w-3/4 animate-pulse rounded-2xl bg-white" />
          <div className="h-12 w-40 animate-pulse rounded-2xl bg-white" />
          <div className="h-24 animate-pulse rounded-2xl bg-white" />
          <div className="h-14 w-64 animate-pulse rounded-full bg-[#ffd51f]/40" />
        </div>
      </div>
    </div>
  );
}
