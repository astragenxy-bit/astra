// ── hooks/useMatching.js ─────────────────────────────────────
import { useQuery, useMutation } from '@tanstack/react-query';
import { matchingAPI, claudeAPI } from '../services/api';
import useAppStore from '../store/useAppStore';

export function useMatching() {
  const { user } = useAppStore();
  const isWorker = user?.user_type === 'WORKER';

  const jobRecsQuery = useQuery({
    queryKey: ['recs', 'jobs'],
    queryFn:  () => matchingAPI.recJobs().then(r => r.data),
    enabled:  isWorker,
    staleTime: 5 * 60 * 1000,
  });

  const courseRecsQuery = useQuery({
    queryKey: ['recs', 'courses'],
    queryFn:  () => matchingAPI.recCourses().then(r => r.data),
    enabled:  isWorker,
    staleTime: 5 * 60 * 1000,
  });

  const profileRecsQuery = useQuery({
    queryKey: ['recs', 'profile'],
    queryFn:  () => matchingAPI.recProfile().then(r => r.data),
    enabled:  isWorker,
  });

  function useJobScore(jobId) {
    return useQuery({
      queryKey: ['score', jobId],
      queryFn:  () => matchingAPI.scoreForJob(jobId).then(r => r.data),
      enabled:  isWorker && !!jobId,
      staleTime: 10 * 60 * 1000,
    });
  }

  function useJobCourses(jobId) {
    return useQuery({
      queryKey: ['job-courses', jobId],
      queryFn:  () => matchingAPI.coursesForJob(jobId).then(r => r.data),
      enabled:  !!jobId,
    });
  }

  const explainMatchMutation = useMutation({
    mutationFn: (data) => claudeAPI.explainMatch(data).then(r => r.data.text),
  });

  const coverLetterMutation = useMutation({
    mutationFn: (data) => claudeAPI.coverLetter(data).then(r => r.data.text),
  });

  const interviewPrepMutation = useMutation({
    mutationFn: (data) => claudeAPI.interviewPrep(data).then(r => r.data.text),
  });

  return {
    jobRecs:      jobRecsQuery.data || [],
    courseRecs:   courseRecsQuery.data || [],
    profileRecs:  profileRecsQuery.data || { jobs: [], courses: [], missing_skills: [] },
    isLoadingRecs: jobRecsQuery.isLoading || courseRecsQuery.isLoading,
    useJobScore,
    useJobCourses,
    explainMatch:  explainMatchMutation.mutateAsync,
    generateCoverLetter: coverLetterMutation.mutateAsync,
    generateInterviewPrep: interviewPrepMutation.mutateAsync,
    isExplaining:  explainMatchMutation.isPending,
  };
}

export default useMatching;
