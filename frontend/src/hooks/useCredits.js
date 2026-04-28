// ── hooks/useCredits.js ──────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { creditAPI } from '../services/api';
import useAppStore from '../store/useAppStore';

export function useCredits() {
  const { credit, setCredit, showToast } = useAppStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['balance'],
    queryFn:  () => creditAPI.balance().then(r => r.data),
    onSuccess: (d) => setCredit(d.balance),
    staleTime: 30000,
  });

  const transactionsQuery = useQuery({
    queryKey: ['transactions'],
    queryFn:  () => creditAPI.transactions().then(r => r.data),
  });

  const topupMutation = useMutation({
    mutationFn: (data) => creditAPI.topup(data),
    onSuccess: () => {
      qc.invalidateQueries(['balance']);
      qc.invalidateQueries(['transactions']);
      showToast('Nạp credit thành công!');
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (data) => creditAPI.withdraw(data),
    onSuccess: () => {
      qc.invalidateQueries(['balance']);
      showToast('Yêu cầu rút tiền đã gửi. Xử lý 3-5 ngày làm việc.');
    },
  });

  return {
    balance:      data?.balance ?? credit,
    isLoading,
    transactions: transactionsQuery.data?.transactions || [],
    topup:        topupMutation.mutateAsync,
    withdraw:     withdrawMutation.mutateAsync,
    isTopping:    topupMutation.isPending,
  };
}
