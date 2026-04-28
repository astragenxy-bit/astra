// src/store/useAppStore.js — Zustand global state
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { userAPI, creditAPI } from '../services/api';

const useAppStore = create(
  persist(
    (set, get) => ({
      /* ── Auth ─────────────────────────────────────────── */
      user:         null,
      accessToken:  null,
      refreshToken: null,
      isAuthed:     false,

      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token',  accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        set({ user, accessToken, refreshToken, isAuthed: true });
      },

      logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, accessToken: null, refreshToken: null, isAuthed: false, credit: 0 });
      },

      updateUser: (updates) => set(state => ({ user: { ...state.user, ...updates } })),

      /* ── Credit ───────────────────────────────────────── */
      credit: 0,
      setCredit: (amount) => set({ credit: amount }),
      addCredit: (amount) => set(state => ({ credit: state.credit + amount })),
      spendCredit:(amount) => set(state => ({ credit: Math.max(0, state.credit - amount) })),

      refreshCredit: async () => {
        try {
          const { data } = await creditAPI.balance();
          set({ credit: data.balance });
        } catch {}
      },

      /* ── UI State ─────────────────────────────────────── */
      role:    'worker',   // worker | employer | trainer | admin
      setRole: (role) => set({ role }),

      notifications: [],
      unreadCount:   0,
      setNotifications: (notifs) => set({
        notifications: notifs,
        unreadCount: notifs.filter(n => !n.read_at).length,
      }),
      markNotifRead: (id) => set(state => ({
        notifications: state.notifications.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n),
        unreadCount: Math.max(0, state.unreadCount - 1),
      })),

      /* ── Toast ────────────────────────────────────────── */
      toasts: [],
      showToast: (message, type = 'success') => {
        const id = Date.now().toString();
        set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
        setTimeout(() => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })), 3500);
      },
      removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

      /* ── Profile data ─────────────────────────────────── */
      workerProfile:   null,
      setWorkerProfile:(p) => set({ workerProfile: p }),

      /* ── Job applications ─────────────────────────────── */
      myApplications:    [],
      setApplications:   (apps) => set({ myApplications: apps }),
      addApplication:    (app)  => set(state => ({ myApplications: [app, ...state.myApplications] })),

      /* ── Enrollments ──────────────────────────────────── */
      myEnrollments:     [],
      setEnrollments:    (e)    => set({ myEnrollments: e }),
      updateEnrollment:  (cId, updates) => set(state => ({
        myEnrollments: state.myEnrollments.map(e => e.course_id === cId ? { ...e, ...updates } : e),
      })),
    }),
    {
      name: 'worklearn-store',
      partialize: (state) => ({
        user:         state.user,
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
        isAuthed:     state.isAuthed,
        role:         state.role,
        credit:       state.credit,
      }),
    }
  )
);

export default useAppStore;
