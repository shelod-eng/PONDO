"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { fetchDemoProducts, type DemoProduct } from "@/lib/api";
import { FALLBACK_IMAGE, FALLBACK_PRODUCTS, IMAGE_BY_PRODUCT } from "@/lib/demoCatalog";
import { usePondoCart } from "@/lib/pondoCart";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

function discountedPrice(p: DemoProduct) {
  return Math.round(p.priceCents * (1 - (p.discountPct || 0) / 100));
}

export default function CartPage() {
  const cart = usePondoCart();
  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDemoProducts()
      .then((out) => setProducts(out.items))
      .catch((e) => {
        setProducts(FALLBACK_PRODUCTS);
        setError(e instanceof Error ? e.message : "load_failed");
      });
  }, []);

  const byId = useMemo(() => {
    const runtime = new Map(products.map((p) => [p.id, p]));
    for (const p of FALLBACK_PRODUCTS) {
      if (!runtime.has(p.id)) runtime.set(p.id, p);
    }
    return runtime;
  }, [products]);

  const lines = useMemo(() => {
    return cart.items
      .map((i) => {
        const p = byId.get(i.productId);
        if (!p) return null;
        const unit = discountedPrice(p);
        return { item: i, product: p, unitCents: unit, lineCents: unit * i.qty };
      })
      .filter(Boolean) as Array<{ item: { productId: string; qty: number }; product: DemoProduct; unitCents: number; lineCents: number }>;
  }, [byId, cart.items]);

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.lineCents, 0), [lines]);
  const deliveryCents = subtotal > 150000 ? 0 : lines.length ? 5990 : 0;
  const total = subtotal + deliveryCents;

  const recommended = useMemo(() => {
    const inCart = new Set(lines.map((l) => l.product.id));
    return FALLBACK_PRODUCTS.filter((p) => !inCart.has(p.id)).slice(0, 3);
  }, [lines]);

  return (
    <div className="min-h-screen bg-[#f1f3f7] text-[var(--pondo-navy-900)]">
      <PondoDemoNav />

      <div className="mx-auto max-w-[1240px] px-4 py-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-5xl font-black tracking-tight">Cart</h1>
            <p className="mt-2 text-sm text-slate-600">Review items, adjust quantities, and continue to secure checkout.</p>
          </div>
          <Link href="/PondoDemo/checkout" className="rounded-xl bg-[var(--pondo-orange-500)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--pondo-orange-400)]">
            Checkout
          </Link>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">API unstable, cart is running in sandbox mode.</div> : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-[var(--pondo-line)] bg-white p-5 shadow-sm">
            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--pondo-line)] bg-[#fafcff] p-8 text-center">
                <div className="text-lg font-bold">Your cart is empty.</div>
                <p className="mt-2 text-sm text-slate-600">Add products from shop to continue.</p>
                <Link href="/PondoDemo/shop" className="mt-4 inline-flex rounded-lg bg-[var(--pondo-navy-900)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--pondo-navy-800)]">
                  Back to Shop
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {lines.map((l) => {
                  const image = IMAGE_BY_PRODUCT[l.product.id] || FALLBACK_IMAGE;
                  return (
                    <article key={l.product.id} className="grid items-center gap-3 rounded-xl border border-[var(--pondo-line)] bg-[#fbfdff] p-3 sm:grid-cols-[120px_1fr_auto_auto]">
                      <div className="h-24 overflow-hidden rounded-lg bg-slate-100" style={{ backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }} />

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l.product.brand}</div>
                        <div className="mt-1 text-2xl font-bold leading-tight">{l.product.name}</div>
                        <div className="mt-2 text-xs text-slate-600">Unit: {money(l.unitCents)} | Stock: {l.product.stock}</div>
                      </div>

                      <div className="flex items-center rounded-lg border border-[var(--pondo-line)] bg-white">
                        <button onClick={() => cart.setQty(l.item.productId, Math.max(1, l.item.qty - 1))} className="px-3 py-2 text-sm font-bold text-[var(--pondo-navy-800)]">-</button>
                        <div className="min-w-10 px-2 text-center text-sm font-semibold">{l.item.qty}</div>
                        <button onClick={() => cart.setQty(l.item.productId, l.item.qty + 1)} className="px-3 py-2 text-sm font-bold text-[var(--pondo-navy-800)]">+</button>
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-black text-[var(--pondo-navy-900)]">{money(l.lineCents)}</div>
                        <button onClick={() => cart.remove(l.item.productId)} className="mt-2 rounded-lg border border-[var(--pondo-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pondo-navy-800)] hover:bg-[#e9f0ff]">
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-[var(--pondo-line)] bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Order Summary</div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="text-slate-600">Subtotal</div>
              <div className="text-right font-semibold">{money(subtotal)}</div>
              <div className="text-slate-600">Delivery</div>
              <div className="text-right font-semibold">{money(deliveryCents)}</div>
              <div className="text-slate-600">Total</div>
              <div className="text-right text-3xl font-black text-[var(--pondo-navy-900)]">{money(total)}</div>
            </div>
            <div className="mt-4 text-xs text-slate-500">Free delivery over R1,500.00.</div>

            <div className="mt-5 grid gap-2">
              <Link href="/PondoDemo/checkout" className="rounded-xl bg-[var(--pondo-orange-500)] px-4 py-3 text-center text-sm font-bold text-white hover:bg-[var(--pondo-orange-400)]">
                Proceed to checkout
              </Link>
              <button onClick={cart.clear} className="rounded-xl border border-[var(--pondo-line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--pondo-navy-800)] hover:bg-[#eef3ff]">
                Clear cart
              </button>
            </div>
          </aside>
        </div>

        {recommended.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-[var(--pondo-line)] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Recommended for you</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {recommended.map((p) => (
                <div key={p.id} className="rounded-xl border border-[var(--pondo-line)] bg-[#fbfdff] p-3">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="mt-1 text-xs text-slate-600">{p.brand}</div>
                  <div className="mt-2 text-lg font-black text-[var(--pondo-orange-500)]">{money(discountedPrice(p))}</div>
                  <button onClick={() => cart.add(p.id, 1)} className="mt-2 rounded-lg bg-[var(--pondo-navy-900)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--pondo-navy-800)]">
                    Add item
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}