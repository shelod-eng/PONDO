"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PondoDemoNav } from "@/components/PondoDemoNav";
import { fetchDemoProducts, type DemoProduct } from "@/lib/api";
import { FALLBACK_IMAGE, FALLBACK_PRODUCTS, IMAGE_BY_PRODUCT } from "@/lib/demoCatalog";
import { usePondoCart } from "@/lib/pondoCart";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function discountedPriceCents(p: DemoProduct) {
  return Math.round(p.priceCents * (1 - (p.discountPct || 0) / 100));
}

function ratingLabel(rating: number) {
  return `${rating.toFixed(1)}/5`;
}

function resolveBadge(p: DemoProduct) {
  if (p.discountPct >= 25) {
    return { label: "FLASH SALE", tone: "bg-[#d63c33] text-white" };
  }
  if (p.rating >= 4.7) {
    return { label: "TOP RATED", tone: "bg-[#059669] text-white" };
  }
  if (p.stock <= 6) {
    return { label: "LOW STOCK", tone: "bg-[#a0522d] text-white" };
  }
  return { label: "KYC VERIFIED", tone: "bg-pondo-navy-900 text-white" };
}

function ProductCard({
  p,
  onAdd,
  onBuy,
  isWishlisted,
  onToggleWishlist,
}: {
  p: DemoProduct;
  onAdd: () => void;
  onBuy: () => void;
  isWishlisted: boolean;
  onToggleWishlist: () => void;
}) {
  const discounted = discountedPriceCents(p);
  const image = IMAGE_BY_PRODUCT[p.id] || FALLBACK_IMAGE;
  const badge = resolveBadge(p);
  const trustScore = Math.min(99, 84 + Math.round(p.rating * 3));
  const deliveryMessage =
    trustScore >= 97 ? "Same-day verified delivery" : "24-48h verified delivery";
  const reviewCount = Math.round(p.rating * 1000);

  return (
    <article className="overflow-hidden rounded-2xl border border-pondo-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="relative h-44 bg-pondo-surface-soft"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <span
          className={`absolute left-3 top-3 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${badge.tone}`}
        >
          {badge.label}
        </span>
        <button
          type="button"
          onClick={onToggleWishlist}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className={`absolute right-3 top-3 rounded-full border px-2 py-1 text-xs font-bold ${
            isWishlisted
              ? "border-[#a0522d] bg-[#a0522d] text-white"
              : "border-white/70 bg-white/90 text-pondo-navy-900"
          }`}
        >
          {isWishlisted ? "â™¥" : "â™¡"}
        </button>
      </div>

      <div className="space-y-2 p-4">
        <div className="text-xs font-semibold text-slate-500">{p.brand}</div>
        <h3 className="line-clamp-2 text-lg font-bold text-pondo-navy-900">{p.name}</h3>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-pondo-orange-500">{ratingLabel(p.rating)}</span>
          <span>{reviewCount} verified reviews</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-3xl font-black text-pondo-orange-500">
            {money(discounted)}
          </div>
          {p.discountPct > 0 ? (
            <div className="text-sm text-slate-400 line-through">{money(p.priceCents)}</div>
          ) : null}
        </div>

        <div className="text-xs font-semibold text-emerald-700">Trust {trustScore}%</div>
        <div className="text-xs text-slate-500">{deliveryMessage}</div>
        <div className="text-xs text-pondo-orange-500">
          Only {Math.max(3, p.stock)} left in stock
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onAdd}
            className="rounded-xl bg-pondo-navy-900 px-3 py-2 text-sm font-bold text-white hover:bg-pondo-navy-800"
          >
            Add to Cart
          </button>
          <button
            type="button"
            onClick={onBuy}
            className="rounded-xl bg-pondo-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-pondo-orange-400"
          >
            Buy Now
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ShopPage() {
  const router = useRouter();
  const cart = usePondoCart();
  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [busy, setBusy] = useState(false);
  const [cartPanelOpen, setCartPanelOpen] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);

  const metrics = useMemo(
    () => [
      { label: "Verified Transactions", value: "2.4M+" },
      { label: "Trader Nodes Active", value: "12,400" },
      { label: "Avg Delivery Time", value: "4.2hrs" },
      { label: "Fraud Rate", value: "0.002%" },
    ],
    [],
  );

  async function load(nextQ = q, nextCategory = category) {
    setBusy(true);
    try {
      const out = await fetchDemoProducts({ q: nextQ, category: nextCategory });
      setProducts(out.items);
      setCategories(out.categories);
    } catch {
      setProducts(FALLBACK_PRODUCTS);
      setCategories(Array.from(new Set(FALLBACK_PRODUCTS.map((p) => p.category))));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pondo:wishlist");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setWishlist(parsed.filter((item) => typeof item === "string"));
      }
    } catch {
      setWishlist([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("pondo:wishlist", JSON.stringify(wishlist));
  }, [wishlist]);

  const sortedProducts = useMemo(() => {
    const copy = [...products];
    if (sortBy === "price_asc") return copy.sort((a, b) => a.priceCents - b.priceCents);
    if (sortBy === "price_desc") return copy.sort((a, b) => b.priceCents - a.priceCents);
    if (sortBy === "rating") return copy.sort((a, b) => b.rating - a.rating);
    return copy;
  }, [products, sortBy]);

  const hasFilters = q.trim().length > 0 || category !== "" || sortBy !== "featured";

  const productById = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const fallback of FALLBACK_PRODUCTS) {
      if (!byId.has(fallback.id)) byId.set(fallback.id, fallback);
    }
    return byId;
  }, [products]);

  const cartLines = useMemo(
    () =>
      cart.items
        .map((item) => {
          const product = productById.get(item.productId);
          if (!product) return null;
          return {
            product,
            qty: item.qty,
            lineCents: discountedPriceCents(product) * item.qty,
          };
        })
        .filter(Boolean) as Array<{ product: DemoProduct; qty: number; lineCents: number }>,
    [cart.items, productById],
  );

  const cartSubtotalCents = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.lineCents, 0),
    [cartLines],
  );

  const isEmpty = !busy && sortedProducts.length === 0;
  const cartCount = cart.count;

  return (
    <div className="min-h-screen bg-[#f1f3f7] text-slate-900">
      <PondoDemoNav />

      <main className="mx-auto max-w-[1240px] px-4 py-4">
        <section className="mb-3 rounded-xl border border-[#2d4478] bg-gradient-to-r from-[#1B2A4A] via-[#243a6e] to-[#4A7FA5] p-6 text-white shadow-md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1b68e]">
                Verified Commerce Network
              </p>
              <h1 className="mt-2 text-4xl font-black leading-tight">
                Shop Verified. Deliver Trusted. Pay Your Way.
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-100/90">
                Secure PED-ready commerce with KYC verification, trusted fulfilment partners, and
                transparent checkout controls.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const grid = document.getElementById("pondo-product-grid");
                  if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="rounded-lg bg-pondo-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-pondo-orange-400"
              >
                Explore Products
              </button>
              <button
                type="button"
                onClick={() => setCartPanelOpen(true)}
                className="rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
              >
                Verified Checkout
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#2d4478] bg-pondo-navy-900 text-white shadow-md">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-[220px]">
              <div className="text-lg font-black leading-none">PONDO</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f1b68e]">
                Trust Commerce
              </div>
            </div>
            <div className="text-sm text-slate-200">
              Deliver to <span className="font-bold">Johannesburg, GP</span>
            </div>
            <div className="ml-auto flex w-full gap-2 lg:w-[620px]">
              <select className="rounded-md border border-[#3d5385] bg-white px-3 py-2 text-sm text-slate-700">
                <option>All</option>
              </select>
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void load(q, category);
                  }
                }}
                placeholder="Search PONDO - trusted commerce"
                className="min-w-0 flex-1 rounded-md border border-[#3d5385] bg-white px-3 py-2 text-sm text-slate-800 outline-none"
              />
              <button
                type="button"
                onClick={() => void load(q, category)}
                disabled={busy}
                className="rounded-md bg-pondo-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60"
              >
                {busy ? "..." : "Search"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#304a7d] bg-[#1b2c57] px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setCategory("");
                void load(q, "");
              }}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                category === ""
                  ? "bg-pondo-orange-500 text-white"
                  : "text-slate-100 hover:bg-white/10"
              }`}
            >
              All
            </button>
            {categories.map((itemCategory) => (
              <button
                key={itemCategory}
                type="button"
                onClick={() => {
                  setCategory(itemCategory);
                  void load(q, itemCategory);
                }}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  category === itemCategory
                    ? "bg-pondo-orange-500 text-white"
                    : "text-slate-100 hover:bg-white/10"
                }`}
              >
                {itemCategory}
              </button>
            ))}
            <div className="ml-auto flex gap-4 pr-2 text-slate-200">
              <span>Today&apos;s Deals</span>
              <span>Top Rated</span>
              <span>PED Ready</span>
            </div>
          </div>
        </section>

        <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-pondo-line bg-white p-4 shadow-sm"
            >
              <div className="mt-1 text-4xl font-black text-pondo-navy-900">
                {metric.value}
              </div>
              <div className="text-sm text-slate-500">{metric.label}</div>
            </div>
          ))}
        </section>

        <section id="pondo-product-grid" className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-4xl font-black text-pondo-navy-900">All Products</h2>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{sortedProducts.length} results</span>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    setCategory("");
                    setSortBy("featured");
                    void load("", "");
                  }}
                  className="rounded-md border border-pondo-line bg-white px-3 py-1.5 text-xs font-semibold text-pondo-navy-800 hover:bg-[#eef3ff]"
                >
                  Clear filters
                </button>
              ) : null}
              <label className="flex items-center gap-2">
                <span>Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="rounded-md border border-pondo-line bg-white px-2 py-1.5 text-sm text-slate-700"
                >
                  <option value="featured">Featured</option>
                  <option value="rating">Top Rated</option>
                  <option value="price_asc">Price Low to High</option>
                  <option value="price_desc">Price High to Low</option>
                </select>
              </label>
            </div>
          </div>

          {isEmpty ? (
            <div className="rounded-2xl border border-dashed border-pondo-line bg-white p-10 text-center">
              <div className="text-2xl font-black text-pondo-navy-900">
                No products match these filters.
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Try clearing filters or changing your search term.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setCategory("");
                  setSortBy("featured");
                  void load("", "");
                }}
                className="mt-4 rounded-lg bg-pondo-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-pondo-navy-800"
              >
                Show full catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
              {sortedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  p={product}
                  onAdd={() => cart.add(product.id, 1)}
                  onBuy={() => {
                    cart.add(product.id, 1);
                    router.push("/PondoDemo/checkout");
                  }}
                  isWishlisted={wishlist.includes(product.id)}
                  onToggleWishlist={() =>
                    setWishlist((current) =>
                      current.includes(product.id)
                        ? current.filter((item) => item !== product.id)
                        : [...current, product.id],
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <button
        type="button"
        onClick={() => setCartPanelOpen(true)}
        className="fixed bottom-5 right-5 z-20 rounded-full bg-pondo-navy-900 px-4 py-3 text-sm font-extrabold text-white shadow-lg hover:bg-pondo-navy-800"
      >
        Cart ({cartCount})
      </button>

      {cartPanelOpen ? (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/40">
          <div className="h-full w-full max-w-md border-l border-pondo-line bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-pondo-navy-900">Verified Cart</h3>
              <button
                type="button"
                onClick={() => setCartPanelOpen(false)}
                className="rounded-md border border-pondo-line px-3 py-1 text-sm font-semibold text-pondo-navy-800 hover:bg-[#eef3ff]"
              >
                Close
              </button>
            </div>

            {cartLines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-pondo-line bg-[#fbfdff] p-6 text-center text-sm text-slate-600">
                Your cart is empty. Add products from the grid.
              </div>
            ) : (
              <div className="space-y-3">
                {cartLines.map((line) => (
                  <div
                    key={line.product.id}
                    className="rounded-xl border border-pondo-line bg-[#fbfdff] p-3"
                  >
                    <div className="text-sm font-bold text-pondo-navy-900">
                      {line.product.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{line.product.brand}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-pondo-orange-500">
                        {money(line.lineCents)}
                      </div>
                      <div className="flex items-center rounded-lg border border-pondo-line bg-white">
                        <button
                          type="button"
                          onClick={() => cart.setQty(line.product.id, Math.max(1, line.qty - 1))}
                          className="px-3 py-1 text-sm font-bold text-pondo-navy-800"
                        >
                          -
                        </button>
                        <span className="px-2 text-sm font-bold text-pondo-navy-900">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => cart.setQty(line.product.id, line.qty + 1)}
                          className="px-3 py-1 text-sm font-bold text-pondo-navy-800"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cart.remove(line.product.id)}
                      className="mt-2 text-xs font-semibold text-[#a0522d] hover:underline"
                    >
                      Remove item
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-pondo-line bg-pondo-navy-900 p-4 text-white">
              <div className="flex items-center justify-between text-sm">
                <span>{cartCount} items</span>
                <span className="font-black">{money(cartSubtotalCents)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/PondoDemo/cart")}
                  className="rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20"
                >
                  Review Cart
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/PondoDemo/checkout")}
                  disabled={cartLines.length === 0}
                  className="rounded-lg bg-pondo-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-pondo-orange-400 disabled:opacity-60"
                >
                  Proceed to Verified Checkout
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

