"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { fetchDemoProducts, type DemoProduct } from "@/lib/api";
import { usePondoCart } from "@/lib/pondoCart";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

function discountedPrice(product: DemoProduct) {
  return Math.round(product.priceCents * (1 - (product.discountPct || 0) / 100));
}

function trustScore(product: DemoProduct) {
  const raw = 91 + product.rating * 1.6 + (product.discountPct || 0) * 0.3;
  return Math.max(90, Math.min(99.9, raw));
}

function badgeForProduct(product: DemoProduct) {
  if (product.discountPct >= 20) return { label: "FLASH SALE", tone: "bg-rose-500/20 text-rose-100 ring-rose-400/40" };
  if (product.rating >= 4.7) return { label: "TOP RATED", tone: "bg-amber-400/20 text-amber-100 ring-amber-300/50" };
  if (product.stock <= 4) return { label: "LOW STOCK", tone: "bg-orange-400/20 text-orange-100 ring-orange-300/40" };
  return { label: "KYC VERIFIED", tone: "bg-emerald-400/20 text-emerald-100 ring-emerald-300/40" };
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <div className="flex items-center gap-1 text-xs text-amber-300">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden className={i < full ? "opacity-100" : "opacity-30"}>
          *
        </span>
      ))}
      <span className="ml-2 text-white/60">{rating.toFixed(1)}</span>
    </div>
  );
}

function deliveryLabel(product: DemoProduct) {
  if (product.stock <= 0) return "Restocking in 24h";
  if (product.stock <= 4) return "Same-day dispatch";
  return "Verified partner delivery";
}

function ProductCard({
  product,
  wished,
  onToggleWish,
  onAdd,
  onBuyNow,
}: {
  product: DemoProduct;
  wished: boolean;
  onToggleWish: () => void;
  onAdd: () => void;
  onBuyNow: () => void;
}) {
  const discounted = discountedPrice(product);
  const outOfStock = product.stock <= 0;
  const badge = badgeForProduct(product);
  const score = trustScore(product);

  return (
    <article className="group relative rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${badge.tone}`}>{badge.label}</span>
        <button
          onClick={onToggleWish}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          className={[
            "rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition",
            wished ? "bg-rose-500/20 text-rose-100 ring-rose-300/40" : "bg-white/5 text-white/70 ring-white/20 hover:bg-white/10",
          ].join(" ")}
        >
          {wished ? "Saved" : "Wishlist"}
        </button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">{product.brand}</div>
          <h3 className="mt-1 pr-8 text-sm font-semibold leading-5">{product.name}</h3>
          <div className="mt-2 text-xs text-emerald-200">Trust score {score.toFixed(1)}%</div>
        </div>
      </div>

      <div className="mt-3 h-28 rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/40 via-slate-700/20 to-slate-900/40 p-3">
        <div className="text-xs text-white/60">Category</div>
        <div className="mt-1 text-sm font-medium text-white/90">{product.category}</div>
        <div className="mt-4 text-xs text-white/60">{deliveryLabel(product)}</div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Stars rating={product.rating} />
        <div className="text-xs text-white/60">{product.stock} in stock</div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          {product.discountPct ? <div className="text-xs text-white/40 line-through">{money(product.priceCents)}</div> : null}
          <div className="text-lg font-semibold">{money(discounted)}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAdd}
            disabled={outOfStock}
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
          <button
            onClick={onBuyNow}
            disabled={outOfStock}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Buy Now
          </button>
        </div>
      </div>
    </article>
  );
}

const WISHLIST_KEY = "pondo:wishlist";

export default function ShopPage() {
  const router = useRouter();
  const cart = usePondoCart();

  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "deals" | "top-rated" | "kyc-ready">("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"featured" | "price-asc" | "price-desc" | "rating">("featured");
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const out = await fetchDemoProducts({ q, category });
      setProducts(out.items);
      setCategories(out.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(WISHLIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setWishlist(parsed.filter((v) => typeof v === "string"));
    } catch {
      // Keep wishlist empty if local data is corrupt.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  const itemsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filtered = useMemo(() => {
    let rows = [...products];
    if (activeTab === "deals") rows = rows.filter((p) => p.discountPct > 0);
    if (activeTab === "top-rated") rows = rows.filter((p) => p.rating >= 4.5);
    if (activeTab === "kyc-ready") rows = rows.filter((p) => p.stock > 0);

    if (sort === "price-asc") rows.sort((a, b) => discountedPrice(a) - discountedPrice(b));
    if (sort === "price-desc") rows.sort((a, b) => discountedPrice(b) - discountedPrice(a));
    if (sort === "rating") rows.sort((a, b) => b.rating - a.rating);

    return rows;
  }, [activeTab, products, sort]);

  const cartLines = useMemo(() => {
    return cart.items
      .map((item) => {
        const product = itemsById.get(item.productId);
        if (!product) return null;
        const unitCents = discountedPrice(product);
        return { item, product, lineCents: unitCents * item.qty };
      })
      .filter(Boolean) as Array<{ item: { productId: string; qty: number }; product: DemoProduct; lineCents: number }>;
  }, [cart.items, itemsById]);

  const subtotal = useMemo(() => cartLines.reduce((sum, row) => sum + row.lineCents, 0), [cartLines]);

  function toggleWish(productId: string) {
    setWishlist((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  }

  function buyNow(productId: string) {
    cart.add(productId, 1);
    router.push("/PondoDemo/checkout");
  }

  function jumpToProducts() {
    const el = document.getElementById("pondo-products");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PondoDemoNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#13284b] via-[#1f3b6a] to-[#345f8f] p-7 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                PONDO Trust Commerce
              </div>
              <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">Shop Verified. Deliver Trusted. Pay Your Way.</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-100/90">
                Every order is routed through vetted fulfilment partners with trust scoring, partner visibility, and compliance-ready checkout.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={jumpToProducts}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Explore Products
                </button>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Verified Checkout
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { title: "Verified Transactions", value: "2.4M+" },
                { title: "Trader Nodes Active", value: "12,400" },
                { title: "Avg Delivery Time", value: "4.2hrs" },
                { title: "Fraud Rate", value: "0.002%" },
              ].map((stat) => (
                <div key={stat.title} className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                  <div className="text-xs text-slate-100/80">{stat.title}</div>
                  <div className="mt-2 text-xl font-bold">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-wide text-white/60">Fulfilment Partner Network</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {["Amazon SA", "Takealot", "Temu", "Shopify", "WooCommerce"].map((partner) => (
              <div key={partner} className="rounded-xl border border-white/15 bg-slate-900/50 px-3 py-2 text-center text-sm font-semibold text-white/90">
                {partner}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Marketplace</h2>
            <p className="mt-2 text-sm text-white/60">
              Search, filter, and sort products with trust-scored cards and partner-aware checkout routing.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search (Samsung, Apple, Nike...)"
              className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30 sm:w-72"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30 sm:w-48"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={load}
              disabled={busy}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90 disabled:opacity-50"
            >
              {busy ? "Loading..." : "Search"}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30 sm:w-44"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price Low-High</option>
              <option value="price-desc">Price High-Low</option>
              <option value="rating">Top Rating</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { key: "all", label: "All Products" },
            { key: "deals", label: "Today's Deals" },
            { key: "top-rated", label: "Top Rated" },
            { key: "kyc-ready", label: "PED Ready" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                activeTab === tab.key ? "bg-white text-slate-900" : "bg-white/5 text-white/80 ring-1 ring-white/15 hover:bg-white/10",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}

        <div id="pondo-products" className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wished={wishlist.includes(product.id)}
              onToggleWish={() => toggleWish(product.id)}
              onAdd={() => cart.add(product.id, 1)}
              onBuyNow={() => buyNow(product.id)}
            />
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-white/60">Loyalty and Trust</div>
              <div className="mt-2 text-sm text-white/80">
                Join the verified shopper lane for partner offers, transparent routing, and compliant checkout visibility.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Open Cart ({cart.count})
              </button>
              <Link href="/PondoDemo/checkout" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white/90">
                Proceed to Verified Checkout
              </Link>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-20 rounded-full border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-100"
      >
        Cart {cart.count}
      </button>

      {drawerOpen ? (
        <div className="fixed inset-0 z-30 bg-black/55">
          <aside className="absolute right-0 top-0 h-full w-full max-w-md border-l border-white/10 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Cart Panel</div>
                <div className="text-xs text-white/60">Verified checkout lane</div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-3 overflow-y-auto pb-40">
              {cartLines.length === 0 ? (
                <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">No items yet. Add products to continue.</div>
              ) : (
                cartLines.map((line) => (
                  <div key={line.product.id} className="rounded-xl border border-white/15 bg-white/5 p-3">
                    <div className="text-xs text-white/60">{line.product.brand}</div>
                    <div className="mt-1 text-sm font-semibold">{line.product.name}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => cart.setQty(line.item.productId, Math.max(1, line.item.qty - 1))}
                          className="h-7 w-7 rounded-md border border-white/20 bg-white/5 text-sm"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-sm">{line.item.qty}</span>
                        <button
                          onClick={() => cart.setQty(line.item.productId, line.item.qty + 1)}
                          className="h-7 w-7 rounded-md border border-white/20 bg-white/5 text-sm"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-sm font-semibold">{money(line.lineCents)}</div>
                    </div>
                    <button onClick={() => cart.remove(line.item.productId)} className="mt-2 text-xs text-rose-200 hover:text-rose-100">
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-slate-950 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Subtotal</span>
                <span className="text-lg font-semibold">{money(subtotal)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/PondoDemo/cart" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/10">
                  Review Cart
                </Link>
                <Link href="/PondoDemo/checkout" className="rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-slate-900 hover:bg-slate-100">
                  Proceed to Verified Checkout
                </Link>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
