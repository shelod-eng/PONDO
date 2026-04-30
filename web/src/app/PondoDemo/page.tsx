import Image from "next/image";
import Link from "next/link";
import { PondoDemoNav } from "@/components/PondoDemoNav";

const promisePillars = [
  {
    title: "Trusted payments",
    copy: "Customers start online buying through a flow that makes payment confidence visible instead of assumed.",
  },
  {
    title: "Trusted delivery",
    copy: "PONDO connects digital payment intent to the real-world handover customers actually care about.",
  },
  {
    title: "Trusted growth",
    copy: "Every successful order helps customers build the confidence to move into bigger online purchases.",
  },
];

const adoptionReasons = [
  "Begin with purchases that feel manageable and low-risk.",
  "See a trust system that connects payment, custody, and delivery.",
  "Use PONDO as the first safe step into broader e-commerce adoption.",
];

export default function PondoDemoIndex() {
  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#102a5c]">
      <PondoDemoNav />

      <section className="relative isolate overflow-hidden border-b border-[#102a5c]/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(176,205,232,0.35),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(214,164,131,0.22),_transparent_30%),linear-gradient(180deg,_#fbf7ef_0%,_#f4ebdd_100%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(16,42,92,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(16,42,92,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="relative mx-auto max-w-7xl px-6 py-10 sm:px-8 lg:px-10 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#102a5c]/10 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-[#c56d3c]">
                PONDO Trust Commerce
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-[-0.05em] text-[#102a5c] sm:text-5xl lg:text-7xl">
                Customers should meet trust before they meet the catalogue.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#2d477a] sm:text-lg">
                PONDO is built for people who want to buy online, but still need proof that payments, deliveries, and handovers can
                be trusted. It turns the first online purchase into a guided confidence-building experience.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/PondoDemo/shop"
                  className="inline-flex items-center justify-center rounded-full bg-[#102a5c] px-7 py-4 text-base font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#0b224d]"
                >
                  Start Buying Through PONDO
                </Link>
                <Link
                  href="/PondoDemo/checkout"
                  className="inline-flex items-center justify-center rounded-full border border-[#102a5c]/15 bg-white/80 px-7 py-4 text-base font-semibold text-[#102a5c] transition hover:bg-white"
                >
                  Explore Verified Checkout
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {promisePillars.map((pillar) => (
                  <div key={pillar.title} className="rounded-[1.4rem] border border-[#102a5c]/10 bg-white/75 p-4 shadow-[0_12px_32px_rgba(16,42,92,0.08)]">
                    <div className="text-sm font-bold text-[#102a5c]">{pillar.title}</div>
                    <p className="mt-2 text-sm leading-6 text-[#365182]">{pillar.copy}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#102a5c]/10 bg-white/70 p-4 shadow-[0_24px_70px_rgba(16,42,92,0.12)] backdrop-blur">
              <Image
                src="/pondo-trust-enabler.svg"
                alt="PONDO trust enabler illustration connecting payments, deliveries, and cash in e-commerce."
                width={900}
                height={620}
                className="h-auto w-full rounded-[1.5rem]"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10 sm:px-8 lg:px-10 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[2rem] border border-[#102a5c]/10 bg-[#fffaf2] p-5 shadow-[0_24px_70px_rgba(16,42,92,0.08)]">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c56d3c]">The Problem</div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#102a5c] sm:text-4xl">
              Broken trust keeps customers out of e-commerce.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#2d477a] sm:text-lg">
              In low-infrastructure environments, customers are not just deciding whether they want a product. They are deciding whether
              payment will work, whether the delivery will happen, and whether the whole transaction can be trusted end to end.
            </p>
            <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-[#102a5c]/10 bg-white p-3">
              <Image
                src="/trust-gap-diagram.svg"
                alt="Diagram explaining the cost of broken trust in low-infrastructure environments."
                width={1400}
                height={820}
                className="h-auto w-full rounded-[1.2rem]"
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#102a5c]/10 bg-[#102a5c] p-8 text-white shadow-[0_24px_70px_rgba(16,42,92,0.16)]">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[#dcb28f]">Why This Matters</div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Trust has to be earned before scale can happen.</h2>
            <p className="mt-5 text-base leading-7 text-[#d9e5fb]">
              PONDO gives customers a first buying experience that feels safer, clearer, and more grounded in physical reality. That is
              the bridge from hesitation to adoption.
            </p>

            <div className="mt-8 space-y-3">
              {adoptionReasons.map((reason) => (
                <div key={reason} className="rounded-[1.2rem] border border-white/10 bg-white/8 px-4 py-4 text-sm leading-6 text-white/90">
                  {reason}
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-dashed border-white/20 bg-white/5 p-5">
              <div className="text-sm uppercase tracking-[0.25em] text-[#dcb28f]">Core Idea</div>
              <p className="mt-3 text-lg font-semibold leading-8">
                Pressing &quot;Buy&quot; should feel like entering a trusted system, not stepping into uncertainty.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10 sm:px-8 lg:px-10 lg:pb-14">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[2rem] border border-[#102a5c]/10 bg-white/80 p-8 shadow-[0_24px_70px_rgba(16,42,92,0.08)]">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[#c56d3c]">How PONDO Delivers Trust</div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-[#102a5c] sm:text-4xl">
              Payment Enabled Delivery turns trust into an experience.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#2d477a] sm:text-lg">
              PONDO is not just a storefront. It is an operational trust layer that secures the real handoff between money, product,
              and delivery through PED devices, vetted custody, and controlled return loops.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/PondoDemo/shop"
                className="inline-flex items-center justify-center rounded-full bg-[#c56d3c] px-7 py-4 text-base font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#b45e31]"
              >
                Enter The Shop
              </Link>

            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-[#102a5c]/10 bg-white p-4 shadow-[0_24px_70px_rgba(16,42,92,0.1)]">
            <Image
              src="/ped-experience.svg"
              alt="Illustration showing the secured Payment Enabled Delivery experience with PED devices, vetted custody, and centralized return protocol."
              width={1400}
              height={780}
              className="h-auto w-full rounded-[1.4rem]"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
