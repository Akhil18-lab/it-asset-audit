import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const FEATURES = [
  { icon: '📡', text: 'Real-time asset tracking across all locations' },
  { icon: '🔐', text: 'Role-based access control for your team' },
  { icon: '📊', text: 'Automated audit schedules and reports' },
  { icon: '🔔', text: 'Warranty expiry alerts and reminders' },
];

export default function Login() {
  const [form, setForm]       = useState({ username: '', password: '' });
  const [error, setError]     = useState('');
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
      {/* ── Left Panel ── */}
      <div className="login-left">
        <div className="login-left-inner">
          {/* Brand */}
          <div className="login-brand">
            <div className="login-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M12 2v20M3 7l9 5 9-5" stroke="#fff" strokeWidth="2"/>
              </svg>
            </div>
            <span className="login-brand-name">AssetAudit</span>
          </div>

          {/* Headline */}
          <div className="login-headline">
            <h1>Manage your IT assets<br />with confidence.</h1>
            <p>Complete visibility over every device, licence, and assignment in your organisation.</p>
          </div>

          {/* Features */}
          <ul className="login-features">
            {FEATURES.map((f, i) => (
              <li key={i}>
                <span className="login-feature-icon">{f.icon}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>

          {/* Bottom badge */}
          <div className="login-left-badge">
            <div className="login-left-badge-dot" />
            <span>Enterprise-grade IT Asset Management</span>
          </div>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="login-right">
        <div className="login-form-wrap">
          {/* Logo (mobile + right panel top) */}
          <div className="login-form-brand">
            <div className="login-brand-icon sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M12 2v20M3 7l9 5 9-5" stroke="#fff" strokeWidth="2"/>
              </svg>
            </div>
            <span>AssetAudit</span>
          </div>

          <h2 className="login-form-title">Sign in to your account</h2>
          <p className="login-form-sub">Enter your credentials to continue</p>

          {error && (
            <div className="login-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="lf-group">
              <label htmlFor="username">Username</label>
              <div className="lf-input-wrap">
                <svg className="lf-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <input
                  id="username" type="text" name="username"
                  value={form.username} onChange={handleChange}
                  placeholder="Enter username" required autoComplete="username" autoFocus
                />
              </div>
            </div>

            <div className="lf-group">
              <label htmlFor="password">Password</label>
              <div className="lf-input-wrap">
                <svg className="lf-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  id="password" type="password" name="password"
                  value={form.password} onChange={handleChange}
                  placeholder="Enter password" required autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" className="lf-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="lf-spinner" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="login-hint-box">
            <span className="login-hint-label">Demo credentials</span>
            <div className="login-hint-row">
              <span>Username</span><code>admin</code>
              <span>Password</span><code>admin123</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
