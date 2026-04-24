import type { PartnerPerformancePoint } from "@/types/admin";

export function PartnerPerfChart({ data }: { data: PartnerPerformancePoint[] }) {
  const max = Math.max(...data.map((item) => item.orders));

  return (
    <article className="admin-panel rounded-[30px] p-6 text-white">
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Partner Health</div>
      <h3 className="admin-display mt-2 text-4xl font-semibold">Fulfilment Partner Performance</h3>
      <p className="mt-2 text-sm text-pondo-text-secondary">Orders dispatched vs delivered | success rate per partner</p>
      <div className="mt-6 space-y-5">
        {data.map((item) => (
          <div key={item.name} className="grid gap-2 md:grid-cols-[140px_1fr] md:items-center">
            <div className="text-right text-xl font-bold leading-tight text-white">{item.name}</div>
            <div>
              <div className="relative h-7 rounded-full bg-[rgba(157,194,242,0.08)]">
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#4A7FA5]" style={{ width: `${(item.orders / max) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#34d399]" style={{ width: `${(item.delivered / max) * 100}%`, opacity: 0.95 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        {data.map((item) => (
          <div key={item.name} className="rounded-2xl border border-[rgba(245,182,66,0.16)] bg-[rgba(245,182,66,0.08)] px-4 py-3">
            <div className="text-pondo-text-secondary">{item.name}</div>
            <div className="text-3xl font-black text-pondo-amber-400">{item.success}%</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-5 text-sm">
        <span className="flex items-center gap-2 text-sky-200"><span className="h-3 w-3 rounded-sm bg-[#4A7FA5]" />Orders</span>
        <span className="flex items-center gap-2 text-emerald-300"><span className="h-3 w-3 rounded-sm bg-[#34d399]" />Delivered</span>
      </div>
    </article>
  );
}

