type FootballIconProps = {
  className?: string;
  label?: string;
};

export function FootballIcon({ className = "", label = "" }: FootballIconProps) {
  return (
    <img
      className={`football-icon ${className}`.trim()}
      src="/football-icon.png"
      alt={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
