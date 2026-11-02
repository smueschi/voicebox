import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

/**
 * Whether the GPU build of Qwen (qwen_cpp) can run here: its tts-server is
 * installed and the 1.7B model is downloaded. False while loading or on error.
 */
export function useGpuQwenAvailable(): boolean {
  const { data: settings } = useQuery({
    queryKey: ['qwenCppSettings'],
    queryFn: () => apiClient.getQwenCppSettings(),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const { data: status } = useQuery({
    queryKey: ['modelStatus'],
    queryFn: () => apiClient.getModelStatus(),
    staleTime: 1000 * 60,
  });
  const downloaded = status?.models.some((m) => m.model_name === 'qwen-cpp-1.7B' && m.downloaded);
  return Boolean(settings?.server_found && downloaded);
}
