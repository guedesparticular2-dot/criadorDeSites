export function BrandMark({ compact = false, name = "Baixada", subtitle = "Futsal Club" }: { compact?: boolean; name?: string; subtitle?: string }) {
  return (
    <span className="brand-mark" aria-label={`${name} ${subtitle}`}>
      <img className="brand-logo" src="/logo-baixada-fc.png" alt="" aria-hidden="true" />
      {!compact && (
        <span className="brand-copy">
          <strong data-text={name.toUpperCase()}>{name.toUpperCase()}</strong>
          <small>{subtitle.toUpperCase()}</small>
        </span>
      )}
    </span>
  );
}
