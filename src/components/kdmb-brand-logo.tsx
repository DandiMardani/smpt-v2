export function KdmbBrandLogo({ className = "h-16 w-32" }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm ${className}`}
    >
      <svg
        viewBox="0 0 240 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full select-none"
      >
        {/* Garis Frame Siku (Atap dan Dinding Kanan membingkai MB) */}
        <path
          d="M92 12 H228 V86"
          stroke="#0F172A"
          strokeWidth="7"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />

        {/* Huruf K */}
        <path
          d="M18 16 V84 M18 52 L54 16 M26 44 L58 84"
          stroke="#0F172A"
          strokeWidth="9"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />

        {/* Huruf D dengan Garis Lintang Horizontal */}
        <path
          d="M74 18 V82 C104 82 110 74 110 50 C110 26 104 18 74 18 Z"
          stroke="#0F172A"
          strokeWidth="8"
          strokeLinecap="square"
        />
        <line
          x1="62"
          y1="50"
          x2="94"
          y2="50"
          stroke="#0F172A"
          strokeWidth="7"
          strokeLinecap="square"
        />

        {/* Huruf M */}
        <path
          d="M124 82 V22 L144 58 L164 22 V82"
          stroke="#0F172A"
          strokeWidth="8"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />

        {/* Huruf B */}
        <path
          d="M180 22 H204 C214 22 216 32 206 48 H180 M180 48 H208 C218 48 218 80 204 80 H180 V22"
          stroke="#0F172A"
          strokeWidth="8"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
}
