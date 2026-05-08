"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type CartItem = { productId: string; qty: number };

const KEY = "pondo_demo_cart_v1";

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.productId === "string" && typeof x.qty === "number");
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function usePondoCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Hydrate cart from localStorage only on client to avoid SSR/client text mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(readCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeCart(items);
  }, [hydrated, items]);

  const add = useCallback((productId: string, qty = 1) => {
    setItems((prev) => {
      const next = [...prev];
      const idx = next.findIndex((i) => i.productId === productId);
      if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + qty };
      else next.push({ productId, qty });
      return next;
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty } : i)).filter((i) => i.qty > 0));
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const replace = useCallback((nextItems: CartItem[]) => {
    setItems(nextItems.filter((i) => i.productId && i.qty > 0));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  return { items, add, setQty, remove, replace, clear, count, hydrated };
}
