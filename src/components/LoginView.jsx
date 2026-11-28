import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Globe,
  MapPin,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import { api, setAuthToken } from '../api';
import { evaluatePassword } from '../passwordPolicy';
import BrandLogo from './BrandLogo';
import PrivacyPolicyModal from './PrivacyPolicyModal';

const LANGUAGES = [
  { code: 'en', badge: 'EN', label: 'English' },
  { code: 'fr', badge: 'FR', label: 'Français' },
  { code: 'es', badge: 'ES', label: 'Español' },
];

const COPY = {
  en: {
    aboutEyebrow: 'About AttendQR',
    mobileAboutEyebrow: 'What is AttendQR?',
    heroTitleLine1: 'Classroom attendance made simple,',
    heroTitleAccent: 'verified in real time',
    heroLead:
      'AttendQR is a real-time QR code attendance platform built for lecturers, teachers, and tutors to replace paper sign-in sheets with fast, fraud-proof classroom check-ins.',
    mobileAboutText:
      'AttendQR is a live QR code attendance register for lecturers and teachers. Project a rotating QR code in class—students scan with their phone camera (no app required) and appear on your register instantly.',
    highlights: [
      {
        bold: 'Take attendance in seconds with rotating QR codes:',
        text: 'Project a live QR code that refreshes every 10–30 seconds so screenshots expire immediately.',
      },
      {
        bold: 'Zero student app or login needed:',
        text: 'Students simply point their phone camera, enter their Student ID & name once, and check in.',
      },
      {
        bold: 'Stop proxy check-ins automatically:',
        text: 'One-device-per-session locking and optional classroom GPS radius verify students are actually in class.',
      },
      {
        bold: 'Live attendance registers & 1-click CSV exports:',
        text: 'Track Present and Late arrivals in real time, organize courses, and export clean reports anytime.',
      },
    ],
    howItWorksBold: 'How it works in 3 simple steps:',
    howItWorksText:
      'Create a course, start a live attendance session, and project the rotating QR code on screen. Students scan with their phone camera and appear on your register instantly—ready to export to CSV.',
    calloutMeta: 'AttendQR · Built for university lectures, labs, and classrooms',
    trustLabel: 'Everything included in your free instructor account',
    badges: ['Rotating QR Codes', 'Anti-Proxy Lock', 'Optional GPS Radius', 'CSV Exports'],
    signupTitle: 'Create your account',
    signupSubtitle: 'Get started free with an instructor account on AttendQR',
    continueGoogle: 'Continue with Google',
    orSignupEmail: 'or sign up with email',
    firstName: 'First Name',
    lastName: 'Last Name',
    emailAddress: 'Email Address',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    passwordPlaceholderSignup: 'Create a strong password (10+ chars)',
    passwordPlaceholderLogin: 'Enter your password',
    passwordPlaceholderReset: '10+ chars, mixed case & symbol',
    emailPlaceholderLogin: 'Enter your email',
    consentPrefix: 'By signing up, you agree to AttendQR processing your account details under our ',
    privacyPolicy: 'Privacy Policy',
    consentSuffix:
      '. We never run ads or third-party trackers, and you can export or delete your data anytime.',
    createAccount: 'Create Account',
    sendingVerification: 'Sending verification code...',
    alreadyHaveAccount: 'Already have an account?',
    loginLink: 'Login',
    loginTitle: 'Log in to your account',
    loginSubtitle: 'Enter your email and password to continue securely.',
    forgotPassword: 'Forgot password?',
    logIn: 'Log in',
    loggingIn: 'Logging in...',
    orDivider: 'OR',
    noAccount: "Don't have an account?",
    signUpLink: 'Sign Up',
    verifyEmailTitle: 'Verify your email',
    verifyEmailSubtitle: (e) => `We sent a 6-digit verification code to ${e}.`,
    forgotTitle: 'Reset your password',
    forgotSubtitle: "Enter your account email and we'll send you a 6-digit reset code.",
    verifyResetTitle: 'Enter reset code',
    verifyResetSubtitle: 'Enter the 6-digit code sent to your inbox.',
    resetTitle: 'Set a new password',
    resetSubtitle: 'Choose a strong new password for your AttendQR account.',
    sendResetCode: 'Send reset code',
    sendingResetCode: 'Sending reset code...',
    backToLogin: 'Back to login',
    editRegistration: 'Edit registration details',
    resendCode: 'Resend code',
    resendIn: (s) => `Resend in ${s}s`,
    saveNewPassword: 'Save new password',
    savingNewPassword: 'Saving new password...',
    requestNewCode: 'Request new code',
    back: 'Back',
    change: 'Change',
    copyright: 'AttendQR 2026. All rights reserved.',
  },
  fr: {
    aboutEyebrow: 'À propos d’AttendQR',
    mobileAboutEyebrow: 'Qu’est-ce qu’AttendQR ?',
    heroTitleLine1: 'La présence en classe simplifiée,',
    heroTitleAccent: 'vérifiée en temps réel',
    heroLead:
      'AttendQR est une plateforme de présence par QR code en temps réel conçue pour les enseignants et formateurs afin de remplacer les feuilles de présence papier.',
    mobileAboutText:
      'AttendQR est un registre de présence en direct par QR code pour les enseignants. Projetez un QR code rotatif en classe : les étudiants scannent sans application et apparaissent aussitôt.',
    highlights: [
      {
        bold: 'Prenez les présences en quelques secondes :',
        text: 'Projetez un QR code rotatif qui se renouvelle toutes les 10 à 30 secondes pour bloquer les captures d’écran.',
      },
      {
        bold: 'Aucune application ni connexion étudiante :',
        text: 'Les étudiants scannent avec l’appareil photo, saisissent leur numéro étudiant et leur nom, et valident.',
      },
      {
        bold: 'Protection anti-fraude intégrée :',
        text: 'Verrouillage d’un appareil par session et rayon GPS optionnel pour confirmer la présence en salle.',
      },
      {
        bold: 'Registres en direct et export CSV en 1 clic :',
        text: 'Suivez les présents et retardataires en temps réel, gérez vos cours et exportez vos rapports.',
      },
    ],
    howItWorksBold: 'Comment ça marche en 3 étapes :',
    howItWorksText:
      'Créez un cours, lancez une session en direct et projetez le QR code rotatif. Les étudiants scannent et s’affichent immédiatement sur votre registre, prêt pour l’export CSV.',
    calloutMeta: 'AttendQR · Conçu pour les cours universitaires, TD et salles de classe',
    trustLabel: 'Tout est inclus dans votre compte enseignant gratuit',
    badges: ['QR Codes Rotatifs', 'Verrou Anti-Proxy', 'Rayon GPS Optionnel', 'Exports CSV'],
    signupTitle: 'Créer votre compte',
    signupSubtitle: 'Commencez gratuitement avec un compte enseignant AttendQR',
    continueGoogle: 'Continuer avec Google',
    orSignupEmail: 'ou s’inscrire par e-mail',
    firstName: 'Prénom',
    lastName: 'Nom',
    emailAddress: 'Adresse e-mail',
    email: 'E-mail',
    password: 'Mot de passe',
    newPassword: 'Nouveau mot de passe',
    passwordPlaceholderSignup: 'Mot de passe fort (10+ caractères)',
    passwordPlaceholderLogin: 'Entrez votre mot de passe',
    passwordPlaceholderReset: '10+ caractères, majuscule et symbole',
    emailPlaceholderLogin: 'Entrez votre e-mail',
    consentPrefix: 'En vous inscrivant, vous acceptez le traitement de votre compte selon notre ',
    privacyPolicy: 'Politique de confidentialité',
    consentSuffix:
      '. Aucune publicité ni traceur tiers, et vous pouvez exporter ou supprimer vos données à tout moment.',
    createAccount: 'Créer un compte',
    sendingVerification: 'Envoi du code de vérification...',
    alreadyHaveAccount: 'Vous avez déjà un compte ?',
    loginLink: 'Connexion',
    loginTitle: 'Connectez-vous à votre compte',
    loginSubtitle: 'Entrez votre e-mail et votre mot de passe pour continuer.',
    forgotPassword: 'Mot de passe oublié ?',
    logIn: 'Se connecter',
    loggingIn: 'Connexion...',
    orDivider: 'OU',
    noAccount: 'Pas encore de compte ?',
    signUpLink: 'S’inscrire',
    verifyEmailTitle: 'Vérifiez votre e-mail',
    verifyEmailSubtitle: (e) => `Nous avons envoyé un code à 6 chiffres à ${e}.`,
    forgotTitle: 'Réinitialiser le mot de passe',
    forgotSubtitle: 'Entrez l’e-mail de votre compte pour recevoir un code à 6 chiffres.',
    verifyResetTitle: 'Entrez le code de réinitialisation',
    verifyResetSubtitle: 'Saisissez le code à 6 chiffres envoyé par e-mail.',
    resetTitle: 'Définir un nouveau mot de passe',
    resetSubtitle: 'Choisissez un nouveau mot de passe sécurisé pour votre compte.',
    sendResetCode: 'Envoyer le code',
    sendingResetCode: 'Envoi du code...',
    backToLogin: 'Retour à la connexion',
    editRegistration: 'Modifier les informations',
    resendCode: 'Renvoyer le code',
    resendIn: (s) => `Renvoyer dans ${s}s`,
    saveNewPassword: 'Enregistrer le mot de passe',
    savingNewPassword: 'Enregistrement...',
    requestNewCode: 'Nouveau code',
    back: 'Retour',
    change: 'Changer',
    copyright: 'AttendQR 2026. Tous droits réservés.',
  },
  es: {
    aboutEyebrow: 'Acerca de AttendQR',
    mobileAboutEyebrow: '¿Qué es AttendQR?',
    heroTitleLine1: 'Asistencia en clase simplificada,',
    heroTitleAccent: 'verificada en tiempo real',
    heroLead:
      'AttendQR es una plataforma de asistencia por código QR en tiempo real creada para docentes y profesores, reemplazando las listas en papel con registros rápidos y seguros.',
    mobileAboutText:
      'AttendQR es un registro de asistencia por código QR en vivo para profesores. Proyecta un QR rotativo en clase: los estudiantes escanean sin app y aparecen al instante.',
    highlights: [
      {
        bold: 'Toma asistencia en segundos con QR rotativos:',
        text: 'Proyecta un código QR que se actualiza cada 10–30 segundos para evitar capturas compartidas.',
      },
      {
        bold: 'Sin app ni cuenta para estudiantes:',
        text: 'Los estudiantes escanean con su cámara, escriben su ID y nombre una vez y registran su asistencia.',
      },
      {
        bold: 'Bloqueo antifraude automático:',
        text: 'Un dispositivo por sesión y radio GPS opcional para confirmar que están dentro del aula.',
      },
      {
        bold: 'Listas en vivo y exportación CSV en 1 clic:',
        text: 'Supervisa presentes y tardanzas en tiempo real, gestiona cursos y descarga reportes al instante.',
      },
    ],
    howItWorksBold: 'Cómo funciona en 3 pasos:',
    howItWorksText:
      'Crea un curso, inicia una sesión en vivo y proyecta el QR rotativo. Los estudiantes escanean y aparecen de inmediato en tu lista, lista para exportar a CSV.',
    calloutMeta: 'AttendQR · Diseñado para clases universitarias, laboratorios y aulas',
    trustLabel: 'Todo incluido en tu cuenta gratuita de instructor',
    badges: ['Códigos QR Rotativos', 'Bloqueo Anti-Proxy', 'Radio GPS Opcional', 'Exportación CSV'],
    signupTitle: 'Crea tu cuenta',
    signupSubtitle: 'Comienza gratis con una cuenta de instructor en AttendQR',
    continueGoogle: 'Continuar con Google',
    orSignupEmail: 'o regístrate con correo',
    firstName: 'Nombre',
    lastName: 'Apellido',
    emailAddress: 'Correo electrónico',
    email: 'Correo electrónico',
    password: 'Contraseña',
    newPassword: 'Nueva contraseña',
    passwordPlaceholderSignup: 'Crea una contraseña segura (10+ caracteres)',
    passwordPlaceholderLogin: 'Ingresa tu contraseña',
    passwordPlaceholderReset: '10+ caracteres, mayúsculas y símbolo',
    emailPlaceholderLogin: 'Ingresa tu correo electrónico',
    consentPrefix: 'Al registrarte, aceptas que AttendQR procese tu cuenta según nuestra ',
    privacyPolicy: 'Política de Privacidad',
    consentSuffix:
      '. Sin anuncios ni rastreadores, y puedes exportar o eliminar tus datos en cualquier momento.',
    createAccount: 'Crear cuenta',
    sendingVerification: 'Enviando código de verificación...',
    alreadyHaveAccount: '¿Ya tienes una cuenta?',
    loginLink: 'Iniciar sesión',
    loginTitle: 'Inicia sesión en tu cuenta',
    loginSubtitle: 'Ingresa tu correo y contraseña para continuar de forma segura.',
    forgotPassword: '¿Olvidaste tu contraseña?',
    logIn: 'Iniciar sesión',
    loggingIn: 'Iniciando sesión...',
    orDivider: 'O',
    noAccount: '¿No tienes una cuenta?',
    signUpLink: 'Registrarse',
    verifyEmailTitle: 'Verifica tu correo',
    verifyEmailSubtitle: (e) => `Enviamos un código de 6 dígitos a ${e}.`,
    forgotTitle: 'Restablecer contraseña',
    forgotSubtitle: 'Ingresa el correo de tu cuenta y te enviaremos un código de 6 dígitos.',
    verifyResetTitle: 'Ingresa el código',
    verifyResetSubtitle: 'Escribe el código de 6 dígitos enviado a tu correo.',
    resetTitle: 'Crea una nueva contraseña',
    resetSubtitle: 'Elige una contraseña segura para tu cuenta de AttendQR.',
    sendResetCode: 'Enviar código',
    sendingResetCode: 'Enviando código...',
    backToLogin: 'Volver a iniciar sesión',
    editRegistration: 'Editar datos de registro',
    resendCode: 'Reenviar código',
    resendIn: (s) => `Reenviar en ${s}s`,
    saveNewPassword: 'Guardar nueva contraseña',
    savingNewPassword: 'Guardando...',
    requestNewCode: 'Solicitar nuevo código',
    back: 'Atrás',
    change: 'Cambiar',
    copyright: 'AttendQR 2026. Todos los derechos reservados.',
  },
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.56-5.15 3.56-8.66z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28a12 12 0 0 0 0 10.76l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

/**
 * 6-box numeric PIN input:
 * - Auto-advances on entry, supports Backspace, Arrows, and full-code paste/autofill
 * - Automatically triggers onComplete(code) when all 6 digits are entered
 */
function OtpPinBoxes({
  idPrefix = 'otp-pin',
  value = '',
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  autoFocus = true,
  focusTrigger = 0,
}) {
  const inputRefs = useRef([]);
  const lastSubmittedRef = useRef('');
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  useEffect(() => {
    if (value.length < 6) {
      lastSubmittedRef.current = '';
    }
  }, [value]);

  useEffect(() => {
    if (focusTrigger > 0 && !disabled) {
      requestAnimationFrame(() => {
        inputRefs.current[0]?.focus();
      });
    }
  }, [focusTrigger, disabled]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      requestAnimationFrame(() => {
        inputRefs.current[0]?.focus();
      });
    }
  }, [autoFocus]);

  function commitDigits(nextArr, focusIndex) {
    const joined = nextArr.join('').replace(/\D/g, '').slice(0, 6);
    onChange(joined);
    if (typeof focusIndex === 'number' && focusIndex >= 0 && focusIndex < 6) {
      requestAnimationFrame(() => {
        inputRefs.current[focusIndex]?.focus();
        inputRefs.current[focusIndex]?.select?.();
      });
    }
    if (joined.length === 6 && !disabled && lastSubmittedRef.current !== joined) {
      lastSubmittedRef.current = joined;
      onComplete?.(joined);
    }
  }

  function handleChange(index, raw) {
    if (disabled) return;
    const onlyDigits = String(raw || '').replace(/\D/g, '');
    if (!onlyDigits) {
      const next = [...digits];
      next[index] = '';
      commitDigits(next, index);
      return;
    }

    if (onlyDigits.length > 1) {
      const next = [...digits];
      const start = onlyDigits.length >= 6 ? 0 : index;
      for (let offset = 0; offset < onlyDigits.length && start + offset < 6; offset++) {
        next[start + offset] = onlyDigits[offset];
      }
      const nextFocus = Math.min(5, start + onlyDigits.length);
      commitDigits(next, nextFocus);
      return;
    }

    const next = [...digits];
    next[index] = onlyDigits;
    commitDigits(next, index < 5 ? index + 1 : 5);
  }

  function handleKeyDown(index, e) {
    if (disabled) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
        commitDigits(next, index);
      } else if (index > 0) {
        next[index - 1] = '';
        commitDigits(next, index - 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index, e) {
    if (disabled) return;
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const next = [...digits];
    const start = pasted.length >= 6 ? 0 : index;
    for (let offset = 0; offset < pasted.length && start + offset < 6; offset++) {
      next[start + offset] = pasted[offset];
    }
    const nextFocus = Math.min(5, start + pasted.length);
    commitDigits(next, nextFocus);
  }

  return (
    <div
      className={`otp-pin-grid ${hasError ? 'is-error' : ''}`}
      role="group"
      aria-label="6-digit verification PIN"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          id={`${idPrefix}-${i}`}
          className={`otp-pin-box mono ${digit ? 'is-filled' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          aria-label={`Digit ${i + 1} of 6`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export default function LoginView({ onAuthenticated, initialError = '' }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'verify-signup' | 'forgot' | 'verify-reset' | 'reset'
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('attendqr_lang');
    return COPY[saved] ? saved : 'en';
  });
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signupCode, setSignupCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetCode, setResetCode] = useState('');
  const [pinFocusTick, setPinFocusTick] = useState(0);
  const [info, setInfo] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const t = COPY[lang] || COPY.en;
  const activeLang = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  const strength = useMemo(() => evaluatePassword(password, email), [password, email]);
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  useEffect(() => {
    localStorage.setItem('attendqr_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const onOutside = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setLangMenuOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setLangMenuOpen(false);
    };
    window.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [langMenuOpen]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    let active = true;
    api
      .getAuthProviders()
      .then((res) => {
        if (active) setGoogleEnabled(Boolean(res?.google));
      })
      .catch(() => {
        if (active) setGoogleEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setInfo('');
  }

  function handleGoogleContinue() {
    setError('');
    setInfo('');
    if (googleEnabled === false) {
      setError(
        'Google Sign-In is currently unavailable. Please continue with your email and password.'
      );
      return;
    }
    window.location.href = '/api/auth/google';
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (mode === 'register') {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Please enter both your first name and last name.');
        return;
      }
      if (!strength.valid) {
        setError(strength.hint || 'Please choose a stronger password (at least 10 characters with mixed case, number, and symbol).');
        return;
      }
      if (!consentAccepted) {
        setError('Please check the consent box to agree to the Privacy Policy.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await api.login(email, password);
        setAuthToken(data.token);
        onAuthenticated(data.teacher, { isNewAccount: false });
      } else {
        const data = await api.register(fullName, email, password, consentAccepted);
        setSignupCode('');
        setInfo(data.message);
        setResendCooldown(30);
        setMode('verify-signup');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitSignupVerification(codeToVerify) {
    const clean = String(codeToVerify ?? signupCode).replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6 || loading) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.verifyRegister(email, clean);
      setAuthToken(data.token);
      onAuthenticated(data.teacher, { isNewAccount: true });
    } catch (err) {
      setSignupCode('');
      setPinFocusTick((tTick) => tTick + 1);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendSignupCode() {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.register(fullName, email, password, true);
      setSignupCode('');
      setPinFocusTick((tTick) => tTick + 1);
      setInfo(data.message);
      setResendCooldown(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setResetCode('');
      setResendCooldown(30);
      setMode('verify-reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitVerifyResetCode(codeToVerify) {
    const clean = String(codeToVerify ?? resetCode).replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6 || loading) return;
    if (!email.trim()) {
      setResetCode('');
      setError('Please enter your account email address first.');
      return;
    }
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.verifyResetCode(email, clean);
      setResetCode(clean);
      setPassword('');
      setInfo(data.message || 'Code verified. Set your new password below.');
      setMode('reset');
    } catch (err) {
      setResetCode('');
      setPinFocusTick((tTick) => tTick + 1);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendResetCode() {
    if (resendCooldown > 0 || loading || !email.trim()) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setResetCode('');
      setPinFocusTick((tTick) => tTick + 1);
      setResendCooldown(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!strength.valid) {
      setError(strength.hint || 'Please choose a stronger password (at least 10 characters with mixed case, number, and symbol).');
      return;
    }
    setLoading(true);
    try {
      const data = await api.resetPassword(email, resetCode, password);
      setResetCode('');
      setPassword('');
      setInfo(data.message);
      setMode('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === 'register';
  const isLogin = mode === 'login';
  const isVerifySignup = mode === 'verify-signup';
  const isVerifyReset = mode === 'verify-reset';

  const strengthBarColor =
    strength.tone === 'strong'
      ? '#16a34a'
      : strength.tone === 'good'
      ? '#22c55e'
      : strength.tone === 'fair'
      ? '#d97706'
      : '#dc2626';

  const badgeIcons = [QrCode, ShieldCheck, MapPin, Download];

  return (
    <div className={`auth-wati-page ${isRegister ? 'is-signup' : 'is-centered'}`}>
      {/* Clean top bar with AttendQR logo & Language selector pill */}
      <header className="auth-wati-topbar">
        <a
          href="/"
          className="auth-wati-logo-link"
          onClick={(e) => {
            e.preventDefault();
            switchMode('login');
          }}
        >
          <BrandLogo size={32} />
        </a>

        <div className="auth-wati-topbar-actions" ref={langMenuRef}>
          <div className="auth-lang-wrap">
            <button
              type="button"
              className="auth-wati-pill"
              onClick={() => setLangMenuOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={langMenuOpen}
              aria-label="Select language"
            >
              <Globe size={14} strokeWidth={1.9} aria-hidden="true" />
              <span className="auth-lang-code">{activeLang.badge}</span>
              <span>{activeLang.label}</span>
              <ChevronDown size={14} strokeWidth={1.9} aria-hidden="true" />
            </button>

            {langMenuOpen && (
              <div className="auth-lang-menu" role="listbox" aria-label="Language options">
                {LANGUAGES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    role="option"
                    aria-selected={item.code === lang}
                    className={`auth-lang-option ${item.code === lang ? 'is-active' : ''}`}
                    onClick={() => {
                      setLang(item.code);
                      setLangMenuOpen(false);
                    }}
                  >
                    <span className="auth-lang-option-left">
                      <span className="auth-lang-code">{item.badge}</span>
                      <span>{item.label}</span>
                    </span>
                    {item.code === lang && <Check size={14} strokeWidth={2.2} aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={`auth-wati-main ${isRegister ? 'is-split' : 'is-single'}`}>
        {/* SIGN UP VIEW — Wati-inspired 2-column split with clear AttendQR explanation */}
        {isRegister ? (
          <div className="auth-split-grid">
            {/* Compact mobile intro so first-time mobile sign-ups immediately know what AttendQR is */}
            <div className="auth-mobile-about">
              <span className="auth-about-eyebrow">{t.mobileAboutEyebrow}</span>
              <h1 className="auth-mobile-about-title">
                {t.heroTitleLine1}{' '}
                <span className="auth-hero-accent">{t.heroTitleAccent}</span>
              </h1>
              <p className="auth-mobile-about-text">{t.mobileAboutText}</p>
            </div>

            {/* Desktop left column (and mobile full overview below card) */}
            <section className="auth-split-hero" aria-label={t.aboutEyebrow}>
              <span className="auth-about-eyebrow">{t.aboutEyebrow}</span>
              <h1 className="auth-hero-title">
                {t.heroTitleLine1}
                <br />
                <span className="auth-hero-accent">{t.heroTitleAccent}</span>
              </h1>
              <p className="auth-hero-lead">{t.heroLead}</p>

              <ul className="auth-hero-list">
                {t.highlights.map((item) => (
                  <li key={item.bold} className="auth-hero-item">
                    <span className="auth-hero-check" aria-hidden="true">
                      <CheckCircle2 size={20} strokeWidth={2.2} />
                    </span>
                    <span>
                      <strong>{item.bold}</strong> {item.text}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="auth-hero-callout">
                <p className="auth-hero-callout-quote">
                  <strong>{t.howItWorksBold}</strong> {t.howItWorksText}
                </p>
                <span className="auth-hero-callout-meta">{t.calloutMeta}</span>
              </div>

              <div className="auth-hero-trust">
                <p className="auth-hero-trust-label">{t.trustLabel}</p>
                <div className="auth-hero-badges">
                  {t.badges.map((label, idx) => {
                    const Icon = badgeIcons[idx] || QrCode;
                    return (
                      <span key={label} className="auth-hero-badge">
                        <Icon size={14} strokeWidth={2} aria-hidden="true" />
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Right column: Clean White Sign-Up Card */}
            <section className="auth-wati-card auth-signup-card" aria-label={t.signupTitle}>
              <div className="auth-card-head">
                <h2 className="auth-card-title">{t.signupTitle}</h2>
                <p className="auth-card-subtitle">{t.signupSubtitle}</p>
              </div>

              {info && (
                <div className="alert alert-info auth-wati-alert" role="status" aria-live="polite">
                  {info}
                </div>
              )}
              {error && (
                <div className="alert alert-error auth-wati-alert" role="alert">
                  {error}
                </div>
              )}

              <button
                type="button"
                className="auth-google-btn"
                onClick={handleGoogleContinue}
                disabled={loading}
              >
                <GoogleIcon />
                <span>{t.continueGoogle}</span>
              </button>

              <div className="auth-wati-divider">
                <span>{t.orSignupEmail}</span>
              </div>

              <form onSubmit={handleAuthSubmit} className="auth-wati-form" autoComplete="on">
                <div className="auth-name-row">
                  <div className="auth-field">
                    <label htmlFor="auth-first-name" className="auth-field-label">
                      <span className="auth-req" aria-hidden="true">*</span> {t.firstName}
                    </label>
                    <input
                      id="auth-first-name"
                      name="given-name"
                      className="auth-wati-input"
                      type="text"
                      autoComplete="given-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      placeholder="Sarah"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="auth-last-name" className="auth-field-label">
                      <span className="auth-req" aria-hidden="true">*</span> {t.lastName}
                    </label>
                    <input
                      id="auth-last-name"
                      name="family-name"
                      className="auth-wati-input"
                      type="text"
                      autoComplete="family-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      placeholder="Mensah"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="auth-email" className="auth-field-label">
                    <span className="auth-req" aria-hidden="true">*</span> {t.emailAddress}
                  </label>
                  <input
                    id="auth-email"
                    name="email"
                    className="auth-wati-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    placeholder="you@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="auth-password" className="auth-field-label">
                    <span className="auth-req" aria-hidden="true">*</span> {t.password}
                  </label>
                  <div className="auth-password-wrap">
                    <input
                      id="auth-password"
                      name="new-password"
                      className="auth-wati-input has-icon-right"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      placeholder={t.passwordPlaceholderSignup}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={10}
                      required
                    />
                    <button
                      type="button"
                      className="auth-eye-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff size={18} strokeWidth={1.8} />
                      ) : (
                        <Eye size={18} strokeWidth={1.8} />
                      )}
                    </button>
                  </div>

                  {password.length > 0 && (
                    <div className="auth-pw-feedback">
                      <div className="auth-pw-bar-track" aria-hidden="true">
                        <div
                          className="auth-pw-bar-fill"
                          style={{
                            width: `${strength.percent}%`,
                            backgroundColor: strengthBarColor,
                          }}
                        />
                      </div>
                      {strength.hint && (
                        <div
                          className={`pw-meter-caption tone-${strength.tone}`}
                          role="status"
                          aria-live="polite"
                        >
                          <span>{strength.hint}</span>
                          <span className="tnum">{strength.percent}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <label htmlFor="auth-consent" className="auth-legal-box">
                  <input
                    id="auth-consent"
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    required
                  />
                  <span>
                    {t.consentPrefix}
                    <button
                      type="button"
                      className="auth-inline-policy-link"
                      onClick={() => setShowPrivacy(true)}
                    >
                      {t.privacyPolicy}
                    </button>
                    {t.consentSuffix}
                  </span>
                </label>

                <button
                  className="auth-wati-primary-btn"
                  type="submit"
                  disabled={
                    loading ||
                    (password.length > 0 && !strength.valid) ||
                    !consentAccepted
                  }
                >
                  {loading ? t.sendingVerification : t.createAccount}
                </button>
              </form>

              <p className="auth-switch-prompt">
                {t.alreadyHaveAccount}{' '}
                <button
                  type="button"
                  className="auth-green-link"
                  onClick={() => switchMode('login')}
                >
                  {t.loginLink}
                </button>
              </p>
            </section>
          </div>
        ) : (
          /* LOGIN, VERIFY EMAIL, FORGOT PASSWORD & RESET VIEWS — Clean centered Wati card */
          <div className="auth-single-wrap">
            <section className="auth-wati-card auth-login-card">
              <div className="auth-card-head">
                <h1 className="auth-card-title">
                  {isLogin
                    ? t.loginTitle
                    : isVerifySignup
                    ? t.verifyEmailTitle
                    : mode === 'forgot'
                    ? t.forgotTitle
                    : isVerifyReset
                    ? t.verifyResetTitle
                    : t.resetTitle}
                </h1>
                <p className="auth-card-subtitle">
                  {isLogin
                    ? t.loginSubtitle
                    : isVerifySignup
                    ? t.verifyEmailSubtitle(email)
                    : mode === 'forgot'
                    ? t.forgotSubtitle
                    : isVerifyReset
                    ? t.verifyResetSubtitle
                    : t.resetSubtitle}
                </p>
              </div>

              {info && (
                <div className="alert alert-info auth-wati-alert" role="status" aria-live="polite">
                  {info}
                </div>
              )}
              {error && (
                <div className="alert alert-error auth-wati-alert" role="alert">
                  {error}
                </div>
              )}

              {isLogin ? (
                <>
                  <form onSubmit={handleAuthSubmit} className="auth-wati-form" autoComplete="on">
                    <div className="auth-field">
                      <label htmlFor="auth-email" className="auth-field-label">
                        {t.email}
                      </label>
                      <input
                        id="auth-email"
                        name="email"
                        className="auth-wati-input"
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="next"
                        placeholder={t.emailPlaceholderLogin}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="auth-field">
                      <div className="auth-field-label-row">
                        <label htmlFor="auth-password" className="auth-field-label">
                          {t.password}
                        </label>
                        <button
                          type="button"
                          className="auth-green-link auth-forgot-link"
                          onClick={() => switchMode('forgot')}
                        >
                          {t.forgotPassword}
                        </button>
                      </div>
                      <div className="auth-password-wrap">
                        <input
                          id="auth-password"
                          name="password"
                          className="auth-wati-input has-icon-right"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          enterKeyHint="done"
                          placeholder={t.passwordPlaceholderLogin}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          className="auth-eye-btn"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <EyeOff size={18} strokeWidth={1.8} />
                          ) : (
                            <Eye size={18} strokeWidth={1.8} />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      className="auth-wati-primary-btn"
                      type="submit"
                      disabled={loading}
                    >
                      {loading ? t.loggingIn : t.logIn}
                    </button>
                  </form>

                  <div className="auth-wati-divider">
                    <span>{t.orDivider}</span>
                  </div>

                  <button
                    type="button"
                    className="auth-google-btn"
                    onClick={handleGoogleContinue}
                    disabled={loading}
                  >
                    <GoogleIcon />
                    <span>{t.continueGoogle}</span>
                  </button>

                  <p className="auth-switch-prompt">
                    {t.noAccount}{' '}
                    <button
                      type="button"
                      className="auth-green-link"
                      onClick={() => switchMode('register')}
                    >
                      {t.signUpLink}
                    </button>
                  </p>
                </>
              ) : isVerifySignup ? (
                <div className="otp-step-wrap">
                  <div className="auth-field">
                    <label
                      htmlFor="signup-pin-0"
                      className="auth-field-label"
                      style={{ textAlign: 'center', display: 'block' }}
                    >
                      6-digit verification code
                    </label>
                    <OtpPinBoxes
                      idPrefix="signup-pin"
                      value={signupCode}
                      onChange={setSignupCode}
                      onComplete={submitSignupVerification}
                      disabled={loading}
                      hasError={Boolean(error)}
                      autoFocus={true}
                      focusTrigger={pinFocusTick}
                    />
                    <div className="otp-pin-status" role="status" aria-live="polite">
                      {loading ? (
                        <>
                          <span className="otp-spinner" aria-hidden="true" />
                          <span>Verifying code &amp; creating account...</span>
                        </>
                      ) : (
                        <span>Verifies automatically when you enter all 6 digits</span>
                      )}
                    </div>
                  </div>

                  <div className="auth-inline-links">
                    <button
                      type="button"
                      className="auth-back-link"
                      onClick={() => switchMode('register')}
                    >
                      <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
                      <span>{t.editRegistration}</span>
                    </button>
                    <button
                      type="button"
                      className="auth-green-link"
                      onClick={handleResendSignupCode}
                      disabled={resendCooldown > 0 || loading}
                      style={{ opacity: resendCooldown > 0 ? 0.55 : 1 }}
                    >
                      {resendCooldown > 0 ? t.resendIn(resendCooldown) : t.resendCode}
                    </button>
                  </div>
                </div>
              ) : mode === 'forgot' ? (
                <form onSubmit={handleRequestReset} className="auth-wati-form" autoComplete="on">
                  <div className="auth-field">
                    <label htmlFor="auth-forgot-email" className="auth-field-label">
                      {t.emailAddress}
                    </label>
                    <input
                      id="auth-forgot-email"
                      name="email"
                      className="auth-wati-input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="send"
                      placeholder="you@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    className="auth-wati-primary-btn"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? t.sendingResetCode : t.sendResetCode}
                  </button>

                  <div className="auth-inline-links" style={{ justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="auth-back-link"
                      onClick={() => switchMode('login')}
                    >
                      <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
                      <span>{t.backToLogin}</span>
                    </button>
                  </div>
                </form>
              ) : isVerifyReset ? (
                <div className="otp-step-wrap">
                  {!email.trim() ? (
                    <div className="auth-field" style={{ marginBottom: 16 }}>
                      <label htmlFor="auth-verify-reset-email" className="auth-field-label">
                        {t.emailAddress}
                      </label>
                      <input
                        id="auth-verify-reset-email"
                        name="email"
                        className="auth-wati-input"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="next"
                        placeholder="you@university.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="otp-email-pill">
                      <span>
                        Code sent to <strong>{email}</strong>
                      </span>
                      <button
                        type="button"
                        className="auth-green-link"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => {
                          setResetCode('');
                          switchMode('forgot');
                        }}
                      >
                        {t.change}
                      </button>
                    </div>
                  )}

                  <div className="auth-field">
                    <label
                      htmlFor="reset-pin-0"
                      className="auth-field-label"
                      style={{ textAlign: 'center', display: 'block' }}
                    >
                      6-digit reset code
                    </label>
                    <OtpPinBoxes
                      idPrefix="reset-pin"
                      value={resetCode}
                      onChange={setResetCode}
                      onComplete={submitVerifyResetCode}
                      disabled={loading}
                      hasError={Boolean(error)}
                      autoFocus={Boolean(email.trim())}
                      focusTrigger={pinFocusTick}
                    />
                    {loading && (
                      <div className="otp-pin-status" role="status" aria-live="polite">
                        <span className="otp-spinner" aria-hidden="true" />
                        <span>Confirming code...</span>
                      </div>
                    )}
                  </div>

                  <div className="auth-inline-links">
                    <button
                      type="button"
                      className="auth-back-link"
                      onClick={() => switchMode('forgot')}
                    >
                      <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
                      <span>{t.back}</span>
                    </button>
                    <button
                      type="button"
                      className="auth-green-link"
                      onClick={handleResendResetCode}
                      disabled={resendCooldown > 0 || loading || !email.trim()}
                      style={{ opacity: resendCooldown > 0 || !email.trim() ? 0.55 : 1 }}
                    >
                      {resendCooldown > 0 ? t.resendIn(resendCooldown) : t.resendCode}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConfirmReset} className="auth-wati-form" autoComplete="on">
                  <input
                    type="email"
                    name="username"
                    autoComplete="username"
                    value={email}
                    readOnly
                    hidden
                  />
                  <div className="otp-email-pill">
                    <span>
                      Verified account: <strong>{email}</strong>
                    </span>
                  </div>

                  <div className="auth-field">
                    <label htmlFor="auth-reset-password" className="auth-field-label">
                      {t.newPassword}
                    </label>
                    <div className="auth-password-wrap">
                      <input
                        id="auth-reset-password"
                        name="new-password"
                        className="auth-wati-input has-icon-right"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        placeholder={t.passwordPlaceholderReset}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={10}
                        required
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff size={18} strokeWidth={1.8} />
                        ) : (
                          <Eye size={18} strokeWidth={1.8} />
                        )}
                      </button>
                    </div>

                    {password.length > 0 && (
                      <div className="auth-pw-feedback">
                        <div className="auth-pw-bar-track" aria-hidden="true">
                          <div
                            className="auth-pw-bar-fill"
                            style={{
                              width: `${strength.percent}%`,
                              backgroundColor: strengthBarColor,
                            }}
                          />
                        </div>
                        {strength.hint && (
                          <div
                            className={`pw-meter-caption tone-${strength.tone}`}
                            role="status"
                            aria-live="polite"
                          >
                            <span>{strength.hint}</span>
                            <span className="tnum">{strength.percent}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    className="auth-wati-primary-btn"
                    type="submit"
                    disabled={loading || !strength.valid}
                  >
                    {loading ? t.savingNewPassword : t.saveNewPassword}
                  </button>

                  <div className="auth-inline-links">
                    <button
                      type="button"
                      className="auth-back-link"
                      onClick={() => switchMode('login')}
                    >
                      <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
                      <span>{t.backToLogin}</span>
                    </button>
                    <button
                      type="button"
                      className="auth-green-link"
                      onClick={() => {
                        setResetCode('');
                        switchMode('forgot');
                      }}
                    >
                      {t.requestNewCode}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <footer className="auth-wati-footer">
              <button
                type="button"
                className="auth-footer-link"
                onClick={() => setShowPrivacy(true)}
              >
                {t.privacyPolicy}
              </button>
              <span className="auth-footer-copy">{t.copyright}</span>
            </footer>
          </div>
        )}
      </main>

      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
