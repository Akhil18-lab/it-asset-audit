import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [form, setForm]     = useState({ username: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  return (
    <div className="login-page">
      {/* Background layers */}
      <div className="login-grid" />
      <div className="login-orb" />

      <div className="login-box">
        {/* Branding */}
        <div className="login-logo">
          <div className="login-logo-icon">🛡</div>
          <div className="login-logo-text">
            <h1>AssetAudit</h1>
            <p>IT Asset Management</p>
          </div>
        </div>

        <p className="subtitle">Welcome back</p>
        <p className="subtitle-sub">Sign in to your workspace to continue</p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="your-username"
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="login-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: 14, height: 14,
                  border: '2px solid rgba(255,255,255,.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin .65s linear infinite',
                }} />
                Authenticating…
              </>
            ) : (
              'Sign in to workspace →'
            )}
          </button>
        </form>

        <div className="login-divider">
          <span>Default credentials</span>
        </div>

        <div className="login-hint">
          Username: <code>admin</code> &nbsp;·&nbsp; Password: <code>admin123</code>
        </div>
      </div>
    </div>
  );
}
