import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { login, verify2fa } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * Вход команды (CRM-PLAN A2/A4): почта + пароль → код из приложения-
 * аутентификатора. При первом входе сервер присылает секрет и otpauth-ссылку —
 * показываем QR и секрет для ручного ввода; 2FA включается после первого
 * верного кода.
 */
export default function Login() {
  const { status, signedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state && location.state.from) || '/today';

  const [step, setStep] = useState('password'); // 'password' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(null); // { tempToken, twoFactor, secret, otpauthUrl }
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef(null);

  useEffect(() => {
    if (!pending || pending.twoFactor !== 'setup' || !pending.otpauthUrl) {
      setQr('');
      return;
    }
    let alive = true;
    QRCode.toDataURL(pending.otpauthUrl, { margin: 1, width: 400 })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [pending]);

  useEffect(() => {
    if (step === 'code' && codeRef.current) codeRef.current.focus();
  }, [step]);

  if (status === 'in') return <Navigate to={from} replace />;

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login(email.trim(), password);
      setPending(res);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const member = await verify2fa(pending.tempToken, code.replace(/\s/g, ''));
      setPassword('');
      signedIn(member);
      navigate(from, { replace: true });
    } catch (err) {
      if (err.code === 'CRM_2FA_EXPIRED') {
        backToPassword(err.message);
      } else {
        setError(err.message);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  function backToPassword(msg) {
    setStep('password');
    setPending(null);
    setCode('');
    setError(msg || '');
  }

  const setup = pending && pending.twoFactor === 'setup';
  const codeOk = /^\d{6}$/.test(code.replace(/\s/g, ''));

  return (
    <div className="auth">
      <div className="card auth-card">
        <div className="auth-brand">
          <div className="brand-name">ЧИТАТЕЛЬ</div>
          <div className="small muted">CRM книжного клуба</div>
        </div>

        {step === 'password' && (
          <form className="auth-form" onSubmit={submitPassword} noValidate>
            <h1 className="h1" style={{ fontSize: 19 }}>Вход для команды</h1>
            {error && <div className="auth-err" role="alert">{error}</div>}
            <div>
              <label className="lbl" htmlFor="email">Почта</label>
              <input id="email" className="inp" type="email" autoComplete="username" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="lbl" htmlFor="password">Пароль</label>
              <input id="password" className="inp" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn-p" type="submit" disabled={busy || !email.trim() || !password}>
              {busy ? 'Проверяем…' : 'Войти'}
            </button>
            <p className="small muted">Нет доступа или забыли пароль — напишите владелице CRM.</p>
          </form>
        )}

        {step === 'code' && (
          <form className="auth-form" onSubmit={submitCode} noValidate>
            <h1 className="h1" style={{ fontSize: 19 }}>
              {setup ? 'Подключите вход по коду' : 'Код из приложения'}
            </h1>
            {setup ? (
              <>
                <p className="small">
                  Это первый вход. Откройте приложение-аутентификатор (Google Authenticator,
                  «Яндекс Ключ», 1Password или похожее), добавьте новый аккаунт и отсканируйте QR-код.
                </p>
                {qr && <div className="qr"><img src={qr} alt="QR-код для приложения-аутентификатора" /></div>}
                <div>
                  <div className="small muted" style={{ marginBottom: 6 }}>Если сканировать не получается — введите ключ вручную:</div>
                  <div className="secret">{pending.secret}</div>
                </div>
                <p className="small">Затем введите 6 цифр, которые покажет приложение.</p>
              </>
            ) : (
              <p className="small">Введите 6 цифр из приложения-аутентификатора для {email.trim()}.</p>
            )}
            {error && <div className="auth-err" role="alert">{error}</div>}
            <div>
              <label className="lbl" htmlFor="code">Код</label>
              <input id="code" ref={codeRef} className="inp code-inp" inputMode="numeric" autoComplete="one-time-code"
                maxLength={7} placeholder="000000" value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ''))} />
            </div>
            <button className="btn-p" type="submit" disabled={busy || !codeOk}>
              {busy ? 'Проверяем…' : setup ? 'Подключить и войти' : 'Войти'}
            </button>
            <button className="lnk small" type="button" onClick={() => backToPassword('')}>← Другая почта</button>
          </form>
        )}
      </div>
    </div>
  );
}
