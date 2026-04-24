import type { KycTrendPoint } from "@/types/admin";

export function KYCTrendChart({ data }: { data: KycTrendPoint[] }) {
  const max = Math.max(...data.flatMap((point) => [point.pass, point.review, point.fail]));

  return (
    <article className="admin-panel rounded-[30px] p-6 text-white">
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Verification Trend</div>
      <h3 className="admin-display mt-2 text-4xl font-semibold">KYC and ITC Checks</h3>
      <p className="mt-2 text-sm text-pondo-text-secondary">Pass vs fail vs review rates this week</p>
      <div className="mt-6 flex h-[280px] items-end gap-6">
        {data.map((point) => (
          <div key={point.day} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex h-full items-end gap-2">
              <div className="w-5 rounded-t-md bg-emerald-400" style={{ height: `${(point.pass / max) * 180}px` }} />
              <div className="w-5 rounded-t-md bg-amber-400" style={{ height: `${(point.review / max) * 180}px` }} />
              <div className="w-5 rounded-t-md bg-red-400" style={{ height: `${(point.fail / max) * 180}px` }} />
            </div>
            <div className="text-sm font-semibold text-pondo-text-secondary">{point.day}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-5 text-sm">
        <span className="flex items-center gap-2 text-emerald-300"><span className="h-3 w-3 rounded-sm bg-emerald-400" />Pass</span>
        <span className="flex items-center gap-2 text-amber-200"><span className="h-3 w-3 rounded-sm bg-amber-400" />Review</span>
        <span className="flex items-center gap-2 text-red-300"><span className="h-3 w-3 rounded-sm bg-red-400" />Fail</span>
      </div>
    </article>
  );
}

