import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10">
          <div className="text-xs tracking-widest text-white/70">PONDO - Demo Portal</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Unified Checkout + Sponsor Portal</h1>
          <p className="mt-4 max-w-3xl text-white/70">
            Demo implementation based on <span className="font-medium text-white">PONDO-TRD-001 v1.0 (April 2026)</span>:
            checkout flow, QR/barcode issuance, credit vetting, payment routing, reconciliation, and audit log.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/checkout"
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90"
            >
              Open Checkout
            </Link>
            <Link
              href="/PondoDemo"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200"
            >
              Open /PondoDemo (eCommerce)
            </Link>
            <Link
              href="/sponsor"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Open Sponsor Portal
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-4">
            {[
              { label: "Latency Target", value: "< 2s" },
              { label: "Encryption", value: "TLS 1.3 / AES-256" },
              { label: "Audit Log", value: "Append-only" },
              { label: "Compliance", value: "POPIA / PCI-DSS" },
            ].map((x) => (
              <div key={x.label} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/60">{x.label}</div>
                <div className="mt-2 text-lg font-semibold">{x.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 text-xs text-white/50">
          Tip: start the API on <span className="font-mono">http://localhost:4100</span> and set{" "}
          <span className="font-mono">NEXT_PUBLIC_API_BASE_URL</span> if needed.
        </div>
      </div>
    </div>
  );
}
