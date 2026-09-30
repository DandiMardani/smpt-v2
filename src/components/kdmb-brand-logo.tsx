export function KdmbBrandLogo({ className = "h-14 w-14" }: { className?: string }) {
  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-2xl bg-white border border-slate-200/90 shadow-sm p-2 transition select-none ${className}`}
    >
      <div className="flex items-center tracking-tighter font-black text-slate-900 leading-none text-xl sm:text-2xl">
        {/* Huruf K */}
        <span>K</span>

        {/* Huruf D dengan garis strip di tengah */}
        <span className="relative inline-block mx-[1px]">
          <span>D</span>
          <span className="absolute left-[-2px] top-1/2 -translate-y-1/2 w-[10px] h-[2px] bg-slate-900 rounded-full pointer-events-none" />
        </span>

        {/* Huruf M dan B yang dibungkus garis siku atas-kanan */}
        <div className="relative inline-flex items-center border-t-2 border-r-2 border-slate-900 pt-0.5 pr-1 pl-0.5 ml-0.5 rounded-tr-[3px]">
          <span>M</span>
          <span className="ml-[1px]">B</span>
        </div>
      </div>
    </div>
  );
}
