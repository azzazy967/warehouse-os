import { useState, type FormEvent } from 'react';
import { ArrowRight, Boxes, LockKeyhole, Mail, Moon, ShieldCheck, Sun, Warehouse } from 'lucide-react';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Banner, Button, Field } from '../ui';

const showDemoAccounts = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

const demoAccounts = [
  { label: 'Administrator', email: 'admin@warehouse.io', password: 'Admin@123' },
  { label: 'Manager', email: 'manager@warehouse.io', password: 'Manager@123' },
  { label: 'Picker', email: 'picker@warehouse.io', password: 'Picker@123' },
];

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-visual">
        <div className="login-brand">
          <span className="brand-mark brand-mark-lg">
            <Warehouse size={28} />
          </span>
          <strong>Warehouse OS</strong>
        </div>
        <div className="login-visual-copy">
          <h1>Every pallet, every movement, in one place.</h1>
          <p>
            Manage stock levels, inbound receipts, pick lists and outbound shipments from a single
            operational console.
          </p>
        </div>
        <div className="login-features">
          <div><Boxes size={18} /> Real-time inventory</div>
          <div><ShieldCheck size={18} /> Role-based access</div>
          <div><ArrowRight size={18} /> Full audit trail</div>
        </div>
        <div className="login-grid" aria-hidden="true" />
      </div>

      <div className="login-form-side">
        <form className="login-card" onSubmit={submit}>
          <button
            type="button"
            className="icon-btn login-theme-btn"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="login-heading">
            <h2>Welcome back</h2>
            <p>Sign in to your warehouse workspace</p>
          </div>

          {error && <Banner kind="error" text={error} />}

          <Field label="Email address">
            <div className="input-wrap">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="username"
                required
              />
            </div>
          </Field>

          <Field label="Password">
            <div className="input-wrap">
              <LockKeyhole size={16} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>
          </Field>

          <Button type="submit" disabled={busy} className="login-submit">
            {busy ? 'Signing in...' : 'Sign in'}
            {!busy && <ArrowRight size={16} />}
          </Button>

          {showDemoAccounts && (
            <div className="demo-block">
              <span className="demo-title">Quick access - demo accounts</span>
              <div className="demo-list">
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="demo-chip"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                      setError('');
                    }}
                  >
                    <strong>{account.label}</strong>
                    <small>{account.email}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
