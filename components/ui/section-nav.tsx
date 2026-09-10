"use client";
export function SectionNav<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  items: readonly { id: T; label: string }[];
  label: string;
}) {
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-current={value === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
