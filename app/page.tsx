// app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Top bar */}
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-600" />
            <div>
              <p className="font-semibold">Relax Inn</p>
              <p className="text-xs text-slate-500">Hartford City · Extended Stay</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/apply"
              className="rounded-2xl px-4 py-2 text-sm font-semibold border border-blue-600 text-white bg-blue-600 hover:bg-blue-700 transition"
            >
              Apply / Manage & Pay
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white border-b border-blue-100">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900">
              Affordable extended stays in Hartford City
            </h1>
            <p className="mt-4 text-slate-600 leading-relaxed">
              The only hotel/motel in town. Weekly & monthly options. Low-income / accessible housing
              focused—simple, safe, convenient.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/apply"
                className="rounded-2xl px-5 py-3 text-sm font-semibold border border-blue-600 text-white bg-blue-600 hover:bg-blue-700 transition"
              >
                Apply / Manage & Pay
              </Link>
              <a
                href="#amenities"
                className="rounded-2xl px-5 py-3 text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
              >
                See amenities
              </a>
            </div>
          </div>
          <div className="rounded-3xl ring-1 ring-slate-200 p-6 bg-white">
            <div className="aspect-[4/3] w-full rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 grid place-items-center text-blue-700">
              <div className="text-center">
                <div className="text-2xl font-bold">Relax Inn · HC</div>
                <div className="mt-2 text-sm">White & Blue Brand Preview</div>
              </div>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-slate-600">
              <li>• Downtown Hartford City</li>
              <li>• Smart lock access</li>
              <li>• Weekly / monthly rates</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Amenities */}
      <section id="amenities" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-bold">Why stay with us</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            ["Extended stays", "Weekly & monthly options for longer-term guests."],
            ["Accessible & affordable", "Low-income friendly, straightforward pricing."],
            ["Kitchenettes (select units)", "Everything you need for a longer stay."],
            ["On-site parking", "Convenient access during your stay."],
            ["Smart locks", "Door codes delivered after payment."],
            ["Local support", "We’re right here in Hartford City."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl ring-1 ring-slate-200 p-5 bg-white">
              <div className="h-10 w-10 rounded-xl bg-blue-600 mb-3" />
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-slate-600 mt-1">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link
            href="/apply"
            className="rounded-2xl px-5 py-3 text-sm font-semibold border border-blue-600 text-white bg-blue-600 hover:bg-blue-700 transition"
          >
            Apply / Manage & Pay
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-500">
          © {new Date().getFullYear()} Relax Inn Hartford City · All rights reserved.
        </div>
      </footer>
    </main>
  );
}
