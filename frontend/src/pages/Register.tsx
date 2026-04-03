import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react';

type RegisterType = 'student' | 'teacher';

const departments = [
  'Faculty of Computer Science',
  'Faculty of Electronic Engineering',
  'Faculty of Business',
  'Faculty of Design',
  'Faculty of Architecture',
  'Faculty of Humanities & Social Sciences',
];

const majors: Record<string, string[]> = {
  'Faculty of Computer Science':           ['Computer Science', 'Software Engineering', 'Artificial Intelligence', 'Data Science'],
  'Faculty of Electronic Engineering':     ['Electronic Engineering', 'Communications Engineering', 'Microelectronics', 'Automation'],
  'Faculty of Business':                   ['Business Administration', 'Accounting', 'Finance', 'Marketing'],
  'Faculty of Design':                     ['Industrial Design', 'Visual Communication', 'Environmental Design', 'Fashion Design'],
  'Faculty of Architecture':               ['Architecture', 'Urban Planning', 'Landscape Design'],
  'Faculty of Humanities & Social Sciences': ['Psychology', 'Sociology', 'Chinese Studies', 'English Studies'],
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#0f0f23',
  outline: 'none',
  background: '#ffffff',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#374151',
  display: 'block',
  marginBottom: '6px',
};

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>{error}</p>}
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [type, setType] = useState<RegisterType>('student');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [sData, setSData] = useState({ name: '', studentId: '', department: '', major: '', phone: '', idCard: '', password: '', confirmPassword: '', accessibility: '' });
  const [tData, setTData] = useState({ name: '', employeeId: '', department: '', phone: '', idCard: '', password: '', confirmPassword: '' });

  const focusIn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#3b5bdb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,91,219,0.08)'; };
  const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; };

  const validate = () => {
    const e: Record<string, string> = {};
    if (type === 'student') {
      if (sData.name.length < 2)                                                           e.name           = 'Please enter your full name.';
      if (!/^\d{8,12}$/.test(sData.studentId))                                            e.studentId      = 'Student ID must be 8–12 digits.';
      if (!sData.department)                                                               e.department     = 'Please select a faculty.';
      if (!sData.major)                                                                    e.major          = 'Please select a major.';
      if (!/^\d{8,15}$/.test(sData.phone))                                                e.phone          = 'Please enter a valid phone number.';
      if (sData.password.length < 6 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(sData.password))   e.password       = 'Password must be ≥6 chars with letters and numbers.';
      if (sData.password !== sData.confirmPassword)                                        e.confirmPassword = 'Passwords do not match.';
    } else {
      if (tData.name.length < 2)                                                           e.name           = 'Please enter your full name.';
      if (!/^\d{6,10}$/.test(tData.employeeId))                                           e.employeeId     = 'Employee ID must be 6–10 digits.';
      if (!tData.department)                                                               e.department     = 'Please select a faculty.';
      if (!/^\d{8,15}$/.test(tData.phone))                                                e.phone          = 'Please enter a valid phone number.';
      if (tData.password.length < 6 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(tData.password))   e.password       = 'Password must be ≥6 chars with letters and numbers.';
      if (tData.password !== tData.confirmPassword)                                        e.confirmPassword = 'Passwords do not match.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 700));
    setIsLoading(false);
    alert('Registration successful!');
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f8f9fb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', height: '100vh', overflow: 'hidden' }}>
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
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(59,91,219,0.10)' }} />
        <div style={{ position: 'absolute', bottom: '60px', left: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(59,91,219,0.07)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '16px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', lineHeight: 1.25, marginBottom: '20px', letterSpacing: '-0.02em' }}>
            Join the Learning Community
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.8 }}>
            Register to access courses,<br />
            view grades and join classes.
          </p>

          <div style={{ marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { n: '01', t: 'Fill in your personal details' },
              { n: '02', t: 'Set a secure password'         },
              { n: '03', t: 'Complete registration'         },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '7px', border: '1px solid rgba(59,91,219,0.4)', background: 'rgba(59,91,219,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{s.n}</span>
                </div>
                <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)' }}>{s.t}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>© 2026 The Hong Kong Polytechnic University</p>
      </div>

      {/* Right form panel — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f0f23', marginBottom: '4px' }}>Create Account</h2>
          <p style={{ fontSize: '15px', color: '#9ca3af', marginBottom: '22px' }}>Fill in your details to get started</p>

          {/* Role toggle */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '3px', marginBottom: '20px', gap: '3px' }}>
            {(['student', 'teacher'] as RegisterType[]).map(t => (
              <button
                key={t}
                onClick={() => { setType(t); setErrors({}); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '14px', fontWeight: type === t ? 600 : 400,
                  background: type === t ? '#ffffff' : 'transparent',
                  color: type === t ? '#0f0f23' : '#6b7280',
                  boxShadow: type === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {t === 'student' ? 'Student' : 'Teacher'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
            {type === 'student' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Full Name *" error={errors.name}>
                    <input value={sData.name} onChange={e => setSData({ ...sData, name: e.target.value })} placeholder="Your full name" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                  </Field>
                  <Field label="Student ID *" error={errors.studentId}>
                    <input value={sData.studentId} onChange={e => setSData({ ...sData, studentId: e.target.value })} placeholder="8–12 digit ID" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Faculty *" error={errors.department}>
                    <select value={sData.department} onChange={e => setSData({ ...sData, department: e.target.value, major: '' })} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} onFocus={focusIn} onBlur={focusOut}>
                      <option value="">Select faculty</option>
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Major *" error={errors.major}>
                    <select value={sData.major} onChange={e => setSData({ ...sData, major: e.target.value })} disabled={!sData.department} style={{ ...inputStyle, appearance: 'none', cursor: sData.department ? 'pointer' : 'not-allowed', opacity: sData.department ? 1 : 0.5 }} onFocus={focusIn} onBlur={focusOut}>
                      <option value="">Select major</option>
                      {sData.department && majors[sData.department]?.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Phone Number *" error={errors.phone}>
                  <input value={sData.phone} onChange={e => setSData({ ...sData, phone: e.target.value })} placeholder="Your phone number" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                </Field>
                <Field label="ID Number (optional)" error={errors.idCard}>
                  <input value={sData.idCard} onChange={e => setSData({ ...sData, idCard: e.target.value })} placeholder="Government-issued ID" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Password *" error={errors.password}>
                    <div style={{ position: 'relative' }}>
                      <input type={showPwd ? 'text' : 'password'} value={sData.password} onChange={e => setSData({ ...sData, password: e.target.value })} placeholder="Letters + numbers" style={{ ...inputStyle, paddingRight: '36px' }} onFocus={focusIn} onBlur={focusOut} />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Confirm Password *" error={errors.confirmPassword}>
                    <div style={{ position: 'relative' }}>
                      <input type={showConfirm ? 'text' : 'password'} value={sData.confirmPassword} onChange={e => setSData({ ...sData, confirmPassword: e.target.value })} placeholder="Repeat password" style={{ ...inputStyle, paddingRight: '36px' }} onFocus={focusIn} onBlur={focusOut} />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                        {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Field>
                </div>

                {/* Accessibility Section */}
                <div style={{ marginTop: '8px', padding: '16px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e8eaed' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#0f0f23', margin: '0 0 4px' }}>Accessibility</h3>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                      Optional. Tell us if you use screen readers or need extra visual support.
                    </p>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: '8px' }}>Blind / low vision</label>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                        <input
                          type="radio"
                          name="accessibility"
                          value="yes"
                          checked={sData.accessibility === 'yes'}
                          onChange={e => setSData({ ...sData, accessibility: e.target.value })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b5bdb' }}
                        />
                        Yes
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                        <input
                          type="radio"
                          name="accessibility"
                          value="no"
                          checked={sData.accessibility === 'no'}
                          onChange={e => setSData({ ...sData, accessibility: e.target.value })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b5bdb' }}
                        />
                        No
                      </label>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '8px 0 0', lineHeight: 1.4 }}>
                      If yes, we'll automatically enable screen-reader friendly layouts and voice-assisted features.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Full Name *" error={errors.name}>
                    <input value={tData.name} onChange={e => setTData({ ...tData, name: e.target.value })} placeholder="Your full name" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                  </Field>
                  <Field label="Employee ID *" error={errors.employeeId}>
                    <input value={tData.employeeId} onChange={e => setTData({ ...tData, employeeId: e.target.value })} placeholder="6–10 digit ID" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                  </Field>
                </div>
                <Field label="Faculty *" error={errors.department}>
                  <select value={tData.department} onChange={e => setTData({ ...tData, department: e.target.value })} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} onFocus={focusIn} onBlur={focusOut}>
                    <option value="">Select faculty</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Phone Number *" error={errors.phone}>
                  <input value={tData.phone} onChange={e => setTData({ ...tData, phone: e.target.value })} placeholder="Your phone number" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                </Field>
                <Field label="ID Number (optional)" error={errors.idCard}>
                  <input value={tData.idCard} onChange={e => setTData({ ...tData, idCard: e.target.value })} placeholder="Government-issued ID" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Password *" error={errors.password}>
                    <div style={{ position: 'relative' }}>
                      <input type={showPwd ? 'text' : 'password'} value={tData.password} onChange={e => setTData({ ...tData, password: e.target.value })} placeholder="Letters + numbers" style={{ ...inputStyle, paddingRight: '36px' }} onFocus={focusIn} onBlur={focusOut} />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Confirm Password *" error={errors.confirmPassword}>
                    <div style={{ position: 'relative' }}>
                      <input type={showConfirm ? 'text' : 'password'} value={tData.confirmPassword} onChange={e => setTData({ ...tData, confirmPassword: e.target.value })} placeholder="Repeat password" style={{ ...inputStyle, paddingRight: '36px' }} onFocus={focusIn} onBlur={focusOut} />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                        {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Field>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%', padding: '11px', borderRadius: '8px', border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 600,
                color: '#ffffff', background: isLoading ? '#9ca3af' : '#0f0f23',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                transition: 'background 0.15s', marginTop: '4px',
              }}
              onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = '#1f1f3a'; }}
              onMouseLeave={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = '#0f0f23'; }}
            >
              {isLoading ? (
                <><div style={{ width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Creating account…</>
              ) : (
                <>Create Account <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '14px', color: '#9ca3af', marginTop: '18px' }}>
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b5bdb', fontSize: '14px', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
            >
              <ArrowLeft size={13} /> Back to Sign In
            </button>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}