/** Clé localStorage pour la liste des personnes autorisées (utilisée pour le champ Rédacteur). */
const STORAGE_KEY = "cirad-authorized-persons";

export function getAuthorizedPersons(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setAuthorizedPersons(persons: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persons));
}
