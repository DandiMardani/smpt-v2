export default function Loading() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
      <div className="relative flex items-center justify-center">
        {/* Spinner outer ring */}
        <div className="h-10 w-10 rounded-full border-3 border-blue-100 border-t-blue-600 animate-spin" />
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500 tracking-wide">
        Memuat data...
      </p>
    </div>
  );
}
