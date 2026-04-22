import type { DemoProduct } from "./api";

export const IMAGE_BY_PRODUCT: Record<string, string> = {
  "samsung-65-qled": "https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=1200&q=80",
  "samsung-s24": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80",
  "apple-iphone-16": "https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?auto=format&fit=crop&w=1200&q=80",
  "nike-airmax": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  "adidas-ultraboost": "https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=1200&q=80",
  "dyson-v15": "https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=1200&q=80",
  "sony-wh1000xm6": "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1200&q=80",
  "lego-starwars": "https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1200&q=80",
  "apple-airpods-pro": "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=1200&q=80",
  "smeg-kettle": "https://images.unsplash.com/photo-1567337710282-00832b415979?auto=format&fit=crop&w=1200&q=80",
  "canon-eos": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
  "redbaton-hoodie": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
  "xbox-series": "https://images.unsplash.com/photo-1621259182978-fbf93132d53d?auto=format&fit=crop&w=1200&q=80",
};

export const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80";

export const FALLBACK_PRODUCTS: DemoProduct[] = [
  { id: "samsung-65-qled", brand: "Samsung", name: "65\" QLED 4K Smart TV", category: "Electronics", priceCents: 1899900, discountPct: 24, rating: 4.7, stock: 14 },
  { id: "samsung-s24", brand: "Samsung", name: "Galaxy S24 Ultra (256GB)", category: "Electronics", priceCents: 2519900, discountPct: 10, rating: 4.7, stock: 12 },
  { id: "apple-iphone-16", brand: "Apple", name: "iPhone 16 Pro (256GB)", category: "Electronics", priceCents: 3399900, discountPct: 0, rating: 4.8, stock: 7 },
  { id: "nike-airmax", brand: "Nike", name: "Air Max 90 Sneakers", category: "Fashion", priceCents: 212500, discountPct: 15, rating: 4.4, stock: 25 },
  { id: "adidas-ultraboost", brand: "Adidas", name: "Ultraboost Running Shoes", category: "Fashion", priceCents: 285000, discountPct: 5, rating: 4.5, stock: 18 },
];
