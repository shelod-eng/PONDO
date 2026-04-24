import { buildLinePath } from "@/components/admin/charts/chartUtils";
import type { RevenueTrendPoint } from "@/types/admin";

function formatCompact(value: number) {
  return `R${Math.round(value / 1000)}k`;
}

export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  const width = 760;
  const height = 250;
  const revenue = data.map((point) => point.revenue);
  const target = data.map((point) => point.target);
  const revenuePath = buildLinePath(revenue, width, height, 70, 30);
  const targetPath = buildLinePath(target, width, height, 70, 30);
  const maxValue = Math.max(...revenue, ...target);

  return (
    <article className="admin-panel rounded-[30px] p-6 text-white">
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Revenue Tracking</div>
      <h3 className="admin-display mt-2 text-4xl font-semibold">Weekly Revenue vs Target</h3>
      <p className="mt-2 text-sm text-pondo-text-secondary">Actual revenue performance against targets</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-6 w-full">
        {[0, 1, 2, 3].map((line) => {
          const y = 30 + line * 48;
          return <line key={line} x1="70" y1={y} x2="700" y2={y} stroke="rgba(157,194,242,0.18)" strokeDasharray="6 6" />;
        })}
        {data.map((point, index) => {
          const x = 70 + (630 * index) / Math.max(data.length - 1, 1);
          return (
            <g key={point.week}>
              <line x1={x} y1="30" x2={x} y2="220" stroke="rgba(157,194,242,0.12)" strokeDasharray="4 8" />
              <text x={x} y="238" textAnchor="middle" fontSize="12" fill="#cdd6e1">
                {point.week}
              </text>
            </g>
          );
        })}
        <path d={targetPath} fill="none" stroke="#9dc2f2" strokeWidth="3" strokeDasharray="7 5" />
        <path d={revenuePath} fill="none" stroke="#f5b642" strokeWidth="4" />
        {data.map((point, index) => {
          const x = 70 + (630 * index) / Math.max(data.length - 1, 1);
          const y = 30 + (1 - point.revenue / maxValue) * 190;
          return <circle key={point.week} cx={x} cy={y} r="8" fill="#f5b642" />;
        })}
      </svg>
      <div className="mt-4 flex flex-wrap justify-center gap-5 text-sm">
        <span className="flex items-center gap-2 text-amber-200"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Revenue</span>
        <span className="flex items-center gap-2 text-sky-200"><span className="h-2.5 w-6 rounded-full border-t-2 border-dashed border-sky-200" />Target</span>
        {data.map((point) => (
          <span key={point.week} className="text-pondo-text-secondary">
            {point.week}: {formatCompact(point.revenue)}
          </span>
        ))}
      </div>
    </article>
  );
}

