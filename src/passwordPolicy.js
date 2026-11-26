// Strict password policy, common-password blocklist, and secure password generator

export const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd',
  'p@ssword', 'p@ssw0rd', 'p@ssword1', 'p@ssword123', 'qwerty', 'qwerty123',
  'qwertyuiop', '123456', '1234567', '12345678', '123456789', '1234567890',
  '111111', '11111111', '000000', '00000000', 'admin', 'admin123', 'admin1234',
  'administrator', 'welcome', 'welcome1', 'welcome123', 'letmein', 'letmein123',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball', 'dragon', 'monkey',
  'shadow', 'master', 'abc123', 'abc12345', 'abcd1234', 'test1234', 'testing123',
  'changeme', 'changeme1', 'trustno1', 'starwars', 'superman', 'batman',
  'eriqo', 'eriqo123', 'attendqr', 'attendqr123', 'attendance', 'attendance1', 'classroom', 'university',
  'college', 'school123', 'teacher', 'teacher123', 'lecturer', 'student123',
  'professor', 'ghana123', 'accra123', 'kumasi123', 'secret123', 'default123',
]);

function normalizeLeet(str) {
  return str
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

export function isCommonPassword(password, email = '') {
  const lower = String(password || '').toLowerCase().trim();
  if (!lower) return false;
  const compact = lower.replace(/[^a-z0-9]/g, '');
  const deleet = normalizeLeet(lower);

  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(compact) || COMMON_PASSWORDS.has(deleet)) {
    return true;
  }
  for (const bad of COMMON_PASSWORDS) {
    if (bad.length >= 6 && (compact.includes(bad) || deleet.includes(bad))) {
      return true;
    }
  }
  // Reject repeated single character or simple keyboard/number sequences
  if (/^(.)\1{5,}$/.test(lower) || /(012345|123456|234567|345678|456789|abcdef|qwerty|asdfgh|zxcvbn)/i.test(lower)) {
    return true;
  }
  // Reject password containing user's email local-part
  const localPart = String(email || '').split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  if (localPart.length >= 4 && compact.includes(localPart)) {
    return true;
  }
  return false;
}

/**
 * Evaluates password strength for the outline meter (0..100).
 * Strict policy requires: >=10 chars, uppercase, lowercase, digit, symbol, and not common.
 */
export function evaluatePassword(password, email = '') {
  const pw = String(password || '');
  if (!pw) {
    return {
      percent: 0,
      tone: 'idle',
      valid: false,
      common: false,
      hint: '',
    };
  }

  const hasLen = pw.length >= 10;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(pw);
  const common = isCommonPassword(pw, email);

  if (common) {
    return {
      percent: 22,
      tone: 'weak',
      valid: false,
      common: true,
      hint: 'Too common — try a unique phrase or tap Suggest',
    };
  }

  const checks = [hasLen, hasLower, hasUpper, hasDigit, hasSymbol];
  const passedCount = checks.filter(Boolean).length;
  const lengthBoost = Math.min(20, Math.floor((pw.length / 10) * 20));
  const rawPct = Math.min(100, Math.round((passedCount / 5) * 80 + lengthBoost));

  const valid = hasLen && hasLower && hasUpper && hasDigit && hasSymbol && !common;

  let hint = '';
  if (!hasLen) {
    const left = 10 - pw.length;
    hint = `${left} more ${left === 1 ? 'character' : 'characters'} needed`;
  } else if (!hasUpper) {
    hint = 'Add an uppercase letter';
  } else if (!hasLower) {
    hint = 'Add a lowercase letter';
  } else if (!hasDigit) {
    hint = 'Add a number';
  } else if (!hasSymbol) {
    hint = 'Add a symbol (e.g. ! @ # $)';
  } else {
    hint = pw.length >= 14 ? 'Strong passphrase' : 'Strong password';
  }

  const percent = valid ? 100 : Math.min(88, Math.max(16, rawPct));
  const tone = valid ? 'strong' : percent >= 64 ? 'good' : 'fair';

  return { percent, tone, valid, common: false, hint };
}

/** Cryptographically random 16-character strong password guaranteed to pass all strict rules */
export function generateSecurePassword() {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*?-';
  const all = lower + upper + digits + symbols;

  const pick = (charset) => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return charset[arr[0] % charset.length];
  };

  const chars = [
    pick(upper),
    pick(upper),
    pick(lower),
    pick(lower),
    pick(digits),
    pick(digits),
    pick(symbols),
    pick(symbols),
  ];
  while (chars.length < 16) {
    chars.push(pick(all));
  }

  // Fisher-Yates shuffle with CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
