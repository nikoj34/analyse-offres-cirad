const COMPANY_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#ea580c', // orange
  '#7c3aed', // violet
  '#ca8a04', // yellow
  '#0891b2', // cyan
  '#be185d', // pink
  '#4f46e5', // indigo
  '#059669', // emerald
  '#9333ea', // purple
  '#d97706', // amber
  '#0d9488', // teal
  '#e11d48', // rose
  '#6d28d9', // dark violet
  '#65a30d', // lime
  '#0284c7', // sky
  '#c2410c', // burnt orange
  '#7c2d12', // brown
  '#4338ca', // deep indigo
  '#15803d', // dark green
  '#b91c1c', // dark red
  '#1d4ed8', // royal blue
  '#a21caf', // magenta
  '#854d0e', // dark gold
  '#0e7490', // dark cyan
  '#9f1239', // crimson
  '#3730a3', // deep blue
  '#166534', // forest green
  '#92400e', // sienna
];

export function getCompanyColor(companyIndex: number): string {
  return COMPANY_COLORS[companyIndex % COMPANY_COLORS.length];
}

/** Returns a very pale/pastel version of the company color (opacity 0.08) for card backgrounds */
export function getCompanyBgColor(companyIndex: number): string {
  const hex = COMPANY_COLORS[companyIndex % COMPANY_COLORS.length];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.06)`;
}
