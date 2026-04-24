import type { KycPieSlice } from "@/types/admin";

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function donutSegment(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

export function KYCPieChart({ data }: { data: KycPieSlice[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const segments = data.map((slice) => {
    const previous = data.slice(0, data.indexOf(slice)).reduce((sum, item) => sum + item.value, 0);
    const start = (previous / total) * 360;
    const end = ((previous + slice.value) / total) * 360;
    return { ...slice, start, end };
  });

  return (
    <article className="admin-panel rounded-[30px] p-6 text-white">
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Verification Mix</div>
      <h3 className="admin-display mt-2 text-4xl font-semibold">KYC Status Distribution</h3>
      <p className="mt-2 text-sm text-pondo-text-secondary">Today&apos;s verification breakdown</p>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 260 220" className="mt-4 w-full max-w-[320px]">
          {segments.map((slice) => {
            return <path key={slice.name} d={donutSegment(130, 100, 52, 84, slice.start, slice.end)} fill={slice.color} stroke="#0b1e38" strokeWidth="4" />;
          })}
          <circle cx="130" cy="100" r="34" fill="#0b1e38" />
        </svg>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
          {data.map((slice) => (
            <span key={slice.name} className="flex items-center gap-2" style={{ color: slice.color }}>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
              {slice.name}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

