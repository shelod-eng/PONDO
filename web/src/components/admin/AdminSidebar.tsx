import type { AdminUser } from "@/types/admin";

const navItems = [
  { href: "#overview", label: "Overview", code: "OV" },
  { href: "#checkouts", label: "Checkouts", code: "TX" },
  { href: "#kyc", label: "KYC / ITC / Vetting", code: "KY" },
  { href: "#drivers", label: "Driver Assignments", code: "DR" },
  { href: "#analytics", label: "Analytics", code: "AN" },
];

export function AdminSidebar({ admin }: { admin: AdminUser }) {
  return (
    <aside className="border-r border-[rgba(45,78,116,0.7)] bg-[rgba(7,20,38,0.55)] backdrop-blur">
      <div className="flex h-full flex-col px-5 py-6 sm:px-7">
        <div className="rounded-[28px] border border-[rgba(245,182,66,0.22)] bg-[linear-gradient(180deg,rgba(245,182,66,0.16),rgba(245,182,66,0.05))] p-5 text-white shadow-[0_18px_36px_rgba(3,10,24,0.22)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-pondo-sky-300">Proposal Direction</div>
          <div className="admin-display mt-3 text-2xl font-semibold">Commerce administration with boardroom polish.</div>
          <p className="mt-3 text-sm leading-6 text-pondo-text-secondary">
            Deep trust palette, clear financial hierarchy, and operational visibility across checkout, vetting, drivers, and analytics.
          </p>
        </div>

        <div className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-pondo-sky-300/80">Navigation</div>
        <nav className="mt-4 space-y-2">
          {navItems.map((item, index) => (
            <a
              key={item.label}
              href={item.href}
              className={[
                "group flex items-center gap-3 rounded-2xl border px-4 py-4 text-base font-semibold transition",
                index === 0
                  ? "border-[rgba(245,182,66,0.32)] bg-[linear-gradient(135deg,rgba(214,69,52,0.24),rgba(78,125,200,0.18))] text-white shadow-[0_18px_30px_rgba(3,10,24,0.2)]"
                  : "border-[rgba(157,194,242,0.08)] bg-white/4 text-pondo-text-secondary hover:bg-white/7 hover:text-white",
              ].join(" ")}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(157,194,242,0.16)] bg-[rgba(6,21,42,0.8)] text-xs font-black tracking-[0.2em] text-pondo-sky-300">
                {item.code}
              </span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="mt-auto pt-8">
          <div className="admin-panel-soft rounded-[28px] p-5 text-white">
            <div className="flex items-center gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--pondo-orange-400),var(--pondo-orange-500))] text-lg font-black text-white">
                {admin.avatar}
              </div>
              <div>
                <div className="admin-display text-2xl font-semibold">{admin.name}</div>
                <div className="text-sm text-pondo-sky-300">{admin.subtitle}</div>
              </div>
            </div>
            <div className="mt-5 text-sm text-pondo-text-secondary">{admin.email}</div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/14 px-3 py-1 text-xs font-bold text-emerald-300">
                ACTIVE
              </span>
              <span className="rounded-full border border-sky-400/20 bg-sky-400/12 px-3 py-1 text-xs font-bold text-sky-200">
                VERIFIED
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

