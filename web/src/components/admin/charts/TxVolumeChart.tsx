import { buildAreaPath, buildLinePath } from "@/components/admin/charts/chartUtils";
import type { TxVolumePoint } from "@/types/admin";

export function TxVolumeChart({ data }: { data: TxVolumePoint[] }) {
  const width = 760;
  const height = 250;
  const completed = data.map((point) => point.completed);
  const failed = data.map((point) => point.failed);
  const pending = data.map((point) => point.pending);
  const areaPath = buildAreaPath(completed, width, height, 60, 28);
  const completedPath = buildLinePath(completed, width, height, 60, 28);
  const failedPath = buildLinePath(failed, width, height, 60, 28);
  const pendingPath = buildLinePath(pending, width, height, 60, 28);

  return (
    <article className="admin-panel rounded-[30px] p-6 text-white">
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Analytics</div>
      <h3 className="admin-display mt-2 text-4xl font-semibold">Transaction Volume</h3>
      <p className="mt-2 text-sm text-pondo-text-secondary">Completed vs failed vs pending checkouts today</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-6 w-full">
        <defs>
          <linearGradient id="tx-volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = 28 + line * 48;
          return <line key={line} x1="60" y1={y} x2="700" y2={y} stroke="rgba(157,194,242,0.18)" strokeDasharray="6 6" />;
        })}
        {data.map((point, index) => {
          const x = 60 + (640 * index) / Math.max(data.length - 1, 1);
          return (
            <g key={point.hour}>
              <line x1={x} y1="28" x2={x} y2="220" stroke="rgba(157,194,242,0.12)" strokeDasharray="4 8" />
              <text x={x} y="238" textAnchor="middle" fontSize="12" fill="#cdd6e1">
                {point.hour}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#tx-volume-fill)" />
        <path d={completedPath} fill="none" stroke="#34d399" strokeWidth="3" />
        <path d={failedPath} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeDasharray="6 4" />
        <path d={pendingPath} fill="none" stroke="#f5b642" strokeWidth="2.5" strokeDasharray="4 4" />
      </svg>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-5 text-sm">
        <span className="flex items-center gap-2 text-emerald-300"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Completed</span>
        <span className="flex items-center gap-2 text-red-300"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />Failed</span>
        <span className="flex items-center gap-2 text-amber-200"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Pending</span>
      </div>
    </article>
  );
}

