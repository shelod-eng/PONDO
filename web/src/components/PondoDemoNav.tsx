"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { usePondoCart } from "@/lib/pondoCart";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={[
        "rounded-lg px-3 py-2 text-sm font-semibold transition",
        active ? "bg-pondo-orange-500 text-white shadow-sm" : "text-slate-100 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function PondoDemoNav() {
  const { auth, logout, hydrated } = useAuth();
  const cart = usePondoCart();
  const cartCount = cart.hydrated ? cart.count : 0;

  return (
    <div className="sticky top-0 z-20 border-b border-[#314a7d] bg-pondo-navy-900 backdrop-blur">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-3">
        <Link href="/PondoDemo/shop" className="text-sm font-extrabold tracking-wide text-white">
          PONDO <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f0b082]">Trust Commerce</span>
        </Link>
        <div className="flex items-center gap-2">
          <NavLink href="/PondoDemo/shop" label="Shop" />
          <NavLink href="/PondoDemo/cart" label={`Cart (${cartCount})`} />
          <NavLink href="/PondoDemo/wallet" label="Wallet" />
          <NavLink href="/PondoDemo/sponsor" label="Sponsor" />
        </div>
        <div className="flex items-center gap-3">
          {!hydrated ? (
            <div className="text-xs text-slate-200/70">Loading session...</div>
          ) : auth ? (
            <>
              <div className="text-xs text-slate-200/85">
                {auth.username} - {auth.role}
              </div>
              <button
                onClick={logout}
                className="rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Log out
              </button>
            </>
          ) : (
            <div className="text-xs text-slate-200/70">Not logged in</div>
          )}
        </div>
      </div>
    </div>
  );
}

