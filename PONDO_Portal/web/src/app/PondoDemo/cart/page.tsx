"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { fetchDemoProducts, type DemoProduct } from "@/lib/api";
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
      .catch((e) => setError(e instanceof Error ? e.message : "load_failed"));
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PondoDemoNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
            <p className="mt-2 text-sm text-white/60">Review items, quantities, and proceed to checkout.</p>
          </div>
          <Link
            href="/PondoDemo/checkout"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90"
          >
            Checkout
          </Link>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
            {lines.length === 0 ? (
              <div className="text-sm text-white/60">
                Your cart is empty.{" "}
                <Link href="/PondoDemo/shop" className="font-semibold text-white hover:underline">
                  Continue shopping
                </Link>
                .
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {lines.map((l) => (
                  <div key={l.product.id} className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <div className="text-xs text-white/60">{l.product.brand}</div>
                      <div className="mt-1 text-sm font-semibold">{l.product.name}</div>
                      <div className="mt-2 text-xs text-white/50">
                        Unit: {money(l.unitCents)} • Stock: {l.product.stock}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={l.item.qty}
                        onChange={(e) => cart.setQty(l.item.productId, Number(e.target.value))}
                        className="w-20 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30"
                      />
                      <div className="w-28 text-right text-sm font-semibold">{money(l.lineCents)}</div>
                      <button
                        onClick={() => cart.remove(l.item.productId)}
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-xs text-white/60">Order summary</div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="text-white/60">Subtotal</div>
              <div className="text-right font-semibold">{money(subtotal)}</div>
              <div className="text-white/60">Delivery</div>
              <div className="text-right font-semibold">{money(deliveryCents)}</div>
              <div className="text-white/60">Total</div>
              <div className="text-right text-lg font-semibold">{money(total)}</div>
            </div>
            <div className="mt-5 text-xs text-white/50">Free delivery over R1,500.00.</div>

            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/PondoDemo/checkout"
                className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-slate-950 hover:bg-white/90"
              >
                Proceed to checkout
              </Link>
              <button
                onClick={cart.clear}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Clear cart
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

