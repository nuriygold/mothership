import { create } from 'zustand';

interface ActivityFilterState {
  entityType: string | null;
  status: string | null;
  setEntityType: (value: string | null) => void;
  setStatus: (value: string | null) => void;
}

export const useActivityFilters = create<ActivityFilterState>((set) => ({
  entityType: null,
  status: null,
  setEntityType: (value) => set({ entityType: value }),
  setStatus: (value) => set({ status: value }),
}));
