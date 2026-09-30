export function KdmbBrandLogo({ className = "h-20 w-20" }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center justify-center aspect-square rounded-2xl bg-white border-2 border-slate-900 shadow-md p-2 transition select-none ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Garis Bingkai Siku Atas-Kanan (Khas Pin KDMB) */}
        <path
          d="M38 31 H91 V71"
          stroke="#0F172A"
          strokeWidth="3.8"
          strokeLinecap="square"
        />

        {/* Huruf K */}
        <path
          d="M9 36 V69 M9 53 L26 36 M13 49 L27 69"
          stroke="#0F172A"
          strokeWidth="4.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />

        {/* Huruf D dengan Garis Tengah */}
        <path
          d="M33 37 V68 C49 68 53 62 53 52.5 C53 43 49 37 33 37 Z"
          stroke="#0F172A"
          strokeWidth="4.2"
          strokeLinecap="square"
        />
        <line
          x1="26"
          y1="52.5"
          x2="43"
          y2="52.5"
          stroke="#0F172A"
          strokeWidth="3.6"
        />

        {/* Huruf M */}
        <path
          d="M59 68 V37 L69 54 L79 37 V68"
          stroke="#0F172A"
          strokeWidth="4.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />

        {/* Huruf B */}
        <path
          d="M87 37 H95 C99 37 100 42 96 49 H87 M87 49 H97 C101 49 101 68 95 68 H87 V37"
          stroke="#0F172A"
          strokeWidth="4"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
}
