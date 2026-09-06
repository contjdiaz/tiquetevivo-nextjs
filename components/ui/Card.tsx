export default function Card({
  title,
  emoji,
  className = "",
  tonal = false,
  children
}: {
  title?: string;
  emoji?: string;
  className?: string;
  tonal?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border ${tonal ? "border-slate-100 bg-slate-50" : "border-slate-200 bg-white"} shadow-card ${className}`}>
      {title && (
        <header className="mb-4">
          <h2 className="text-lg font-extrabold text-slate-900">
            {emoji && <span className="mr-2">{emoji}</span>}
            {title}
          </h2>
        </header>
      )}
      {children}
    </section>
  );
}