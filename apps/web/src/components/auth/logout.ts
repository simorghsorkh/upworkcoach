import { apiPost } from '@/components/api/client';

/** POST /api/v1/auth/logout, then a full navigation so no signed-in state survives in memory. */
export async function logout(): Promise<void> {
  try {
    await apiPost('/api/v1/auth/logout');
  } finally {
    window.location.assign('/login');
  }
}
