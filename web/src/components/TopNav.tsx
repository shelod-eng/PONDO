"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={[
        "rounded-lg px-3 py-2 text-sm font-medium",
        active ? "bg-white text-slate-950" : "text-white/80 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function TopNav() {
  const { auth, logout } = useAuth();

  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm font-semibold tracking-wide text-white">
          PONDO Demo
        </Link>
        <div className="flex items-center gap-2">
          <NavLink href="/checkout" label="Checkout" />
          <NavLink href="/sponsor" label="Sponsor Portal" />
        </div>
        <div className="flex items-center gap-3">
          {auth ? (
            <>
              <div className="text-xs text-white/60">
                {auth.username} • {auth.role}
              </div>
              <button
                onClick={logout}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                Log out
              </button>
            </>
          ) : (
            <div className="text-xs text-white/50">Not logged in</div>
          )}
        </div>
      </div>
    </div>
  );
}

