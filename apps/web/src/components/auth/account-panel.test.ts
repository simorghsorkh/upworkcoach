// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationOptionDTO } from '@/modules/identity/contracts';
import { OrganizationCard } from './account-panel';

const A: OrganizationOptionDTO = {
  id: 'org-a',
  name: 'آکادمی تکانش',
  role: 'mentor',
  current: true,
};
const B: OrganizationOptionDTO = { id: 'org-b', name: 'آکادمی ب', role: 'admin', current: false };

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OrganizationCard (ADR-0011)', () => {
  it('shows the current organization and no switch for a single membership', () => {
    render(createElement(OrganizationCard, { organizations: [A] }));
    expect(screen.getByText('آکادمی تکانش')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('posts the chosen organization and shows the server message on failure', async () => {
    const fetchMock = mockFetch(404, { code: 'NOT_FOUND', message: 'پیدا نشد.' });
    const user = userEvent.setup({ delay: null });
    render(createElement(OrganizationCard, { organizations: [A, B] }));
    await user.click(screen.getByRole('button', { name: 'رفتن به این سازمان' }));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/auth/organization');
    expect(JSON.parse(String(init?.body))).toEqual({ organizationId: 'org-b' });
    expect((await screen.findByRole('alert')).textContent).toContain('پیدا نشد.');
    expect(screen.getByRole('button', { name: 'رفتن به این سازمان' })).toBeTruthy();
  });
});
