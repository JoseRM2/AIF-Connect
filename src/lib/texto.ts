/** Minúsculas y sin acentos, para búsquedas tolerantes. */
export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
