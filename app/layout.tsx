import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Inventory Reservations",
  description: "Race-condition-safe ecommerce inventory reservation demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <Link href="/products" className="text-lg font-semibold tracking-tight">
              Allo Reserve
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-600">
              <Link className="hover:text-zinc-950" href="/products">
                Products
              </Link>
              <Link className="hover:text-zinc-950" href="/reservations">
                Checkout
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
