import Link from "next/link";
import { redirect } from "next/navigation";

export default function Home() {
  if (process.env.PONDO_ADMIN_MODE !== "true") {
    redirect("/PondoDemo");
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#06152a_0%,#0b1e38_42%,#102743_100%)] text-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-[32px] border border-[rgba(45,78,116,0.85)] bg-[linear-gradient(180deg,rgba(16,39,67,0.96)_0%,rgba(10,27,48,0.98)_100%)] p-10 shadow-[0_20px_50px_rgba(3,10,24,0.28)]">
          <div className="text-xs font-semibold uppercase tracking-[0.34em] text-[#9dc2f2]">PONDO Trust Commerce</div>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-tight text-white">Admin Access & Billing Portals</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-[#cdd6e1]">
            Dedicated admin host for sandbox billing, sponsor billing, and the PONDO Admin Command Centre.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/checkout"
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#ea6a3f,#d64534)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(214,69,52,0.24)] transition hover:brightness-110"
            >
              Open Sandbox Billing Portal
            </Link>
            <Link
              href="/sponsor"
              className="inline-flex items-center justify-center rounded-full border border-[rgba(157,194,242,0.18)] bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
            >
              Open Sponsor Billing
            </Link>
            <Link
              href="/PondoAdmin"
              className="inline-flex items-center justify-center rounded-full border border-[#f5b642]/35 bg-[#f5b642] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105"
            >
              Open /PondoAdmin
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Admin Host", value: "localhost:3001" },
              { label: "Public Commerce", value: "localhost:3000" },
              { label: "API", value: "localhost:4100" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[rgba(157,194,242,0.12)] bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-[#9dc2f2]">{item.label}</div>
                <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
