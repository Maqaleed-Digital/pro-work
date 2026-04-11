const NAV_ITEMS = [
  { href: "/command-center", label: "Command Center" },
  { href: "/board-assurance", label: "Board and Assurance" },
  { href: "/pipeline-intake", label: "Pipeline and Intake" },
  { href: "/allocation-resilience", label: "Allocation and Resilience" },
  { href: "/federation-entities", label: "Federation and Entities" },
  { href: "/accountability-recovery", label: "Accountability and Recovery" },
  { href: "/doctrine-certification", label: "Doctrine and Certification" }
];

export function Navigation() {
  return (
    <nav aria-label="Primary">
      <ul style={{ display: "grid", gap: "8px", padding: 0, listStyle: "none" }}>
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <a href={item.href} style={{ color: "#0f172a", textDecoration: "none", fontWeight: 600 }}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
