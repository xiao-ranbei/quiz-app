import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';
import { useAuthStore } from '../store/authStore';
import { useModeStore } from '../store/modeStore';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>首页路由</div>} />
        <Route path="/memory" element={<div>背诵首页路由</div>} />
        <Route path="/welcome" element={<div>欢迎路由</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const fakeUser = { id: 'u1', email: 'a@b.com' } as never;
const fakeSession = {} as never;

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    session: null,
    loading: false,
    error: null,
  });
});

describe('登录成功后的跳转', () => {
  it('背诵模式下登录后跳转到背诵首页', async () => {
    useModeStore.setState({ mode: 'memory' });
    renderLogin();

    useAuthStore.setState({ user: fakeUser, session: fakeSession });

    await waitFor(() => {
      expect(screen.getByText('背诵首页路由')).toBeTruthy();
    });
  });

  it('刷题模式下登录后跳转到首页', async () => {
    useModeStore.setState({ mode: 'quiz' });
    renderLogin();

    useAuthStore.setState({ user: fakeUser, session: fakeSession });

    await waitFor(() => {
      expect(screen.getByText('首页路由')).toBeTruthy();
    });
  });

  it('未选模式时登录后跳转到欢迎页选模式', async () => {
    useModeStore.setState({ mode: null });
    renderLogin();

    useAuthStore.setState({ user: fakeUser, session: fakeSession });

    await waitFor(() => {
      expect(screen.getByText('欢迎路由')).toBeTruthy();
    });
  });
});
