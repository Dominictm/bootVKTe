export interface Table {
  id: number;
  prefix: string;
}

export const TABLES: Table[] = [
  { id: 1, prefix: "Стол 1" },
  { id: 2, prefix: "Стол 2" },
  { id: 3, prefix: "Стол 3" },
];

export function getTableById(id: number): Table {
  const table = TABLES.find((t) => t.id === id);
  if (!table) {
    throw new Error(`Unknown table id: ${id}`);
  }
  return table;
}
