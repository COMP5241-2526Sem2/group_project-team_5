import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

type UserType = 'student' | 'staff';

export default function Login() {
  const navigate = useNavigate();
  const [userType, setUserType] = useState<UserType>('student');
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!accountId || !password) { setError('Please enter your account ID and password.'); return; }
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 600));
    setIsLoading(false);
    const isStudent = /^\d{8,12}$/.test(accountId);
    if (userType === 'student' && isStudent) {
      alert('Student login successful!');
    } else {
      navigate('/admin');
    }
  };

  return (
    <div style={{ minHeight: '100vh', height: '100vh', display: 'flex', background: '#f8f9fb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' }}>
      {/* Left brand panel */}
      <div
        className="hidden lg:flex"
        style={{
          width: '42%',
          background: '#0f0f23',
          display: 'flex',
          flexDirection: 'column',
          padding: '52px 48px',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(59,91,219,0.12)' }} />
        <div style={{ position: 'absolute', bottom: '80px', left: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(59,91,219,0.08)' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        </div>

        {/* Copy */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '16px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', lineHeight: 1.25, marginBottom: '20px', letterSpacing: '-0.02em' }}>
            Learning Management System
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75 }}>
            Unified management of students,<br />
            instructors and course resources.
          </p>

          <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              'Centralised course & student management',
              'Real-time analytics and reporting',
              'Secure, role-based access control',
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3b5bdb', flexShrink: 0 }} />
                <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.25)' }}>
          © 2026 The Hong Kong Polytechnic University
        </p>
      </div>

      {/* Right form panel — vertically centred */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          {/* Mobile logo */}
          <div className="lg:hidden" style={{ display: 'none', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f0f23' }}>OpenStudy</span>
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f0f23', marginBottom: '4px' }}>Sign In</h2>
          <p style={{ fontSize: '15px', color: '#9ca3af', marginBottom: '28px' }}>Welcome back — sign in to your account</p>

          {/* Role toggle */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '3px', marginBottom: '22px', gap: '3px' }}>
            {(['student', 'staff'] as UserType[]).map(type => (
              <button
                key={type}
                onClick={() => setUserType(type)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: userType === type ? 600 : 400,
                  background: userType === type ? '#ffffff' : 'transparent',
                  color: userType === type ? '#0f0f23' : '#6b7280',
                  boxShadow: userType === type ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {type === 'student' ? 'Student' : 'Staff / Admin'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '7px' }}>
                {userType === 'student' ? 'Student ID' : 'Employee ID / Account'}
              </label>
              <input
                type="text"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                placeholder={userType === 'student' ? 'Enter your student ID' : 'Enter employee ID or admin account'}
                style={{
                  width: '100%',
                  padding: '10px 13px',
                  border: `1px solid ${error ? '#ef4444' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#0f0f23',
                  outline: 'none',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,91,219,0.1)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = error ? '#ef4444' : '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>Password</label>
                <button type="button" style={{ fontSize: '13px', color: '#3b5bdb', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 13px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#0f0f23',
                    outline: 'none',
                    background: '#ffffff',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,91,219,0.1)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && <p style={{ fontSize: '13px', color: '#ef4444', margin: 0 }}>{error}</p>}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '15px',
                fontWeight: 600,
                color: '#ffffff',
                background: isLoading ? '#9ca3af' : '#0f0f23',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                transition: 'background 0.15s',
                marginTop: '4px',
              }}
              onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = '#1f1f3a'; }}
              onMouseLeave={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = '#0f0f23'; }}
            >
              {isLoading ? (
                <>
                  <div style={{ width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Signing in…
                </>
              ) : (
                <>Sign In <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '14px', color: '#9ca3af', marginTop: '22px' }}>
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/register')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b5bdb', fontSize: '14px', padding: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
            >
              Create account
            </button>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}