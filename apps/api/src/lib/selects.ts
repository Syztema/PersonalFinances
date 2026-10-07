/** Referencias que viajan en los DTOs (con `isActive` para mostrar "(eliminada)"). */
export const refSelect = { id: true, name: true, icon: true, color: true, isActive: true } as const;
export const accountRefSelect = { ...refSelect, type: true } as const;
export const categoryRefSelect = { ...refSelect, kind: true, parentId: true } as const;
