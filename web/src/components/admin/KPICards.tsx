import type { KpiMetric } from "@/types/admin";

export function KPICards({ metrics }: { metrics: KpiMetric[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article
          key={metric.id}
          className="admin-panel-soft rounded-[28px] p-6 text-white"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(16,39,67,0.96) 0%, rgba(10,27,48,0.98) 100%), linear-gradient(135deg, ${metric.accent}22, transparent 58%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <span
              className="inline-flex min-w-12 items-center justify-center rounded-full border px-3 py-2 text-xs font-black tracking-[0.22em]"
              style={{
                borderColor: `${metric.accent}55`,
                color: metric.accent,
                backgroundColor: `${metric.accent}15`,
              }}
            >
              {metric.icon}
            </span>
            <span className="text-right text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: metric.accent }}>
              {metric.label}
            </span>
          </div>
          <div className="mt-8 text-4xl font-black tracking-tight text-white sm:text-5xl">{metric.value}</div>
          <div className="mt-3 text-sm text-pondo-text-secondary">{metric.hint}</div>
        </article>
      ))}
    </div>
  );
}

