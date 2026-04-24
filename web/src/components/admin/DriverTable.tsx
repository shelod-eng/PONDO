import { DotBadge } from "@/components/admin/StatusBadge";
import type { DriverAssignment } from "@/types/admin";

export function DriverTable({ drivers }: { drivers: DriverAssignment[] }) {
  const activeCount = drivers.filter((driver) => driver.status === "ACTIVE").length;
  const offShiftCount = drivers.length - activeCount;

  return (
    <section id="drivers" className="admin-panel rounded-[30px] text-white">
      <div className="flex flex-col gap-4 border-b border-[rgba(45,78,116,0.7)] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-pondo-sky-300">Field Operations</div>
          <h2 className="admin-display mt-2 text-4xl font-semibold">Driver Assignments and PED Devices</h2>
          <p className="mt-2 text-sm text-pondo-text-secondary">KYC-verified driver network | live delivery status</p>
        </div>
        <div className="flex gap-3 text-sm font-bold">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/14 px-4 py-2 text-emerald-300">{activeCount} Active</span>
          <span className="rounded-full border border-slate-400/20 bg-slate-300/10 px-4 py-2 text-slate-300">{offShiftCount} Off Shift</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="admin-table min-w-full text-left">
          <thead className="text-xs font-black uppercase tracking-[0.18em]">
            <tr>
              <th className="px-4 py-4">Driver ID</th>
              <th className="px-4 py-4">Name</th>
              <th className="px-4 py-4">KYC Status</th>
              <th className="px-4 py-4">Zone</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Current Assignment</th>
              <th className="px-4 py-4">Today&apos;s Deliveries</th>
              <th className="px-4 py-4">Rating</th>
              <th className="px-4 py-4">PED Device</th>
              <th className="px-4 py-4">Delivery Step</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver) => (
              <tr key={driver.driverId} className="text-sm text-white">
                <td className="px-4 py-4 font-semibold text-pondo-sky-300">{driver.driverId}</td>
                <td className="px-4 py-4 text-lg font-bold">{driver.name}</td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/14 px-3 py-1 text-xs font-bold text-emerald-300">
                    VERIFIED
                  </span>
                </td>
                <td className="px-4 py-4 text-pondo-text-secondary">{driver.zone}</td>
                <td className="px-4 py-4">
                  <DotBadge active={driver.status === "ACTIVE"} label={driver.status === "ACTIVE" ? "ACTIVE" : "OFF"} />
                </td>
                <td className="px-4 py-4 font-semibold text-pondo-text-secondary">{driver.currentAssignment ?? "-"}</td>
                <td className="px-4 py-4 text-xl font-black text-pondo-amber-400">{driver.deliveriesToday}</td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/14 px-3 py-1 text-sm font-bold text-amber-200">
                    {driver.rating.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-4 text-pondo-sky-300">{driver.pedDevice}</td>
                <td className="px-4 py-4 font-semibold text-[#d9b8ff]">{driver.deliveryStep}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

