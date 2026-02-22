import { create } from 'zustand';
import type {
  Lorebook,
  LorebookDetail,
  SessionSummary,
  SessionDetail,
  ImageAsset,
  Toast,
} from '../api/types';
import {
  listLorebooks,
  getLorebook,
  listSessions,
  getSession,
  listImages,
} from '../api/client';

interface AppState {
  // Lorebooks
  lorebooks: Lorebook[];
  currentLorebook: LorebookDetail | null;
  fetchLorebooks: () => Promise<void>;
  fetchLorebook: (id: string) => Promise<void>;

  // Sessions
  sessions: SessionSummary[];
  currentSession: SessionDetail | null;
  fetchSessions: () => Promise<void>;
  fetchSession: (id: string) => Promise<void>;

  // Gallery
  images: ImageAsset[];
  fetchImages: (filters?: { asset_type?: string }) => Promise<void>;

  // Toast notifications
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set) => ({
  // Lorebooks
  lorebooks: [],
  currentLorebook: null,

  fetchLorebooks: async () => {
    const lorebooks = await listLorebooks();
    set({ lorebooks });
  },

  fetchLorebook: async (id: string) => {
    const currentLorebook = await getLorebook(id);
    set({ currentLorebook });
  },

  // Sessions
  sessions: [],
  currentSession: null,

  fetchSessions: async () => {
    const sessions = await listSessions();
    set({ sessions });
  },

  fetchSession: async (id: string) => {
    const currentSession = await getSession(id);
    set({ currentSession });
  },

  // Gallery
  images: [],

  fetchImages: async (filters) => {
    const images = await listImages(filters);
    set({ images });
  },

  // Toast notifications
  toasts: [],

  addToast: (toast) => {
    const id = String(++toastId);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
