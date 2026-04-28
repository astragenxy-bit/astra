// ── hooks/useAuth.js ─────────────────────────────────────────
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authAPI } from '../services/api';
import useAppStore from '../store/useAppStore';

export function useAuth() {
  const { user, isAuthed, setAuth, logout } = useAppStore();

  const loginMutation = useMutation({
    mutationFn: ({ email, password }) => authAPI.login(email, password),
    onSuccess: ({ data }) => {
      setAuth(data.user, data.access_token, data.refresh_token);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data) => authAPI.register(data),
  });

  const verifyOTPMutation = useMutation({
    mutationFn: ({ email, otp }) => authAPI.verifyOTP(email, otp),
    onSuccess: ({ data }) => {
      setAuth(data.user, data.access_token, data.refresh_token);
    },
  });

  const handleLogout = useCallback(() => { logout(); }, [logout]);

  return {
    user, isAuthed,
    login:     loginMutation.mutateAsync,
    register:  registerMutation.mutateAsync,
    verifyOTP: verifyOTPMutation.mutateAsync,
    logout:    handleLogout,
    isLoading: loginMutation.isPending || registerMutation.isPending,
    error:     loginMutation.error || registerMutation.error,
  };
}
