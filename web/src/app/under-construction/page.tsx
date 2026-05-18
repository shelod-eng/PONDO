export default function UnderConstructionPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,108,63,0.16),transparent_32%),linear-gradient(180deg,#07111f_0%,#0a1628_100%)] px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center">
        <section className="w-full rounded-[28px] border border-[rgba(110,151,201,0.22)] bg-[rgba(13,26,44,0.96)] px-8 py-12 text-center shadow-[0_28px_60px_rgba(0,0,0,0.32)] sm:px-12">
          <div className="inline-flex rounded-full bg-[rgba(239,108,63,0.14)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-[#ffd8cb]">
            Scheduled Maintenance
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
            PONDO is temporarily unavailable
          </h1>
          <p className="mt-4 text-base leading-8 text-[#bfd0e6] sm:text-lg">
            We are performing scheduled updates. Please check back later.
            <span className="font-semibold text-[#ef6c3f]"> Thank you for your patience.</span>
          </p>
        </section>
      </div>
    </main>
  );
}
