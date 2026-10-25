export function SimplePage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{title}</h1>
      <div className="mt-4 space-y-4 text-mute">{children}</div>
    </div>
  );
}
