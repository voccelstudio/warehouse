import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export const useInventoryStore = create((set) => ({
  items: [],
  itemsPerShelf: 6,

  addItem: (itemData) => set((state) => ({
    items: [...state.items, {
      id: uuidv4(),
      ...itemData,
      dateAdded: new Date().toISOString(),
    }]
  })),

  removeItem: (id) => set((state) => ({
    items: state.items.filter(item => item.id !== id)
  })),

  getShelves: (state) => {
    const shelves = []
    for (let i = 0; i < state.items.length; i += state.itemsPerShelf) {
      shelves.push(state.items.slice(i, i + state.itemsPerShelf))
    }
    return shelves
  }
}))