import {
  MIN_PASSWORD,
  looksLikeEmail,
  newPasswordProblem,
  passwordError,
  passwordProblem,
  randomPassword,
  resetError,
} from './password';

describe('password', () => {
  const good = 'mi perro come pan';

  it('checks the new password before asking Firebase', () => {
    expect(passwordProblem('', good, good)).toBe('Escriba su contraseña actual.');
    expect(MIN_PASSWORD).toBe(15);
    expect(passwordProblem('vieja12345', 'catorce letras', 'catorce letras')).toContain('15 caracteres');
    expect(passwordProblem('vieja12345', good, 'mi gato come pan')).toBe('Las contraseñas nuevas no coinciden.');
    expect(passwordProblem(good, good, good)).toBe('La contraseña nueva debe ser distinta de la actual.');
    expect(passwordProblem('vieja12345', good, good)).toBeNull();
  });

  it('turns Firebase errors into plain words', () => {
    expect(passwordError('auth/invalid-credential')).toBe('La contraseña actual no es correcta.');
    expect(passwordError('auth/wrong-password')).toBe('La contraseña actual no es correcta.');
    expect(passwordError('auth/too-many-requests')).toContain('Demasiados intentos');
    expect(passwordError('auth/something-new')).toBe('No se pudo cambiar la contraseña. Intente de nuevo.');
    expect(passwordError(undefined)).toBe('No se pudo cambiar la contraseña. Intente de nuevo.');
  });

  it('the page of the e-mail link: no current password, and tells a dead link apart', () => {
    expect(newPasswordProblem(good, good)).toBeNull();
    expect(newPasswordProblem('corta', 'corta')).toContain('15 caracteres');
    expect(resetError('auth/expired-action-code')).toBeNull();
    expect(resetError('auth/invalid-action-code')).toBeNull();
    expect(resetError('auth/password-does-not-meet-requirements')).toContain('15 caracteres');
  });

  it('recognizes an e-mail before sending the reset link', () => {
    expect(looksLikeEmail(' ana@correo.com ')).toBe(true);
    expect(looksLikeEmail('ana')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });

  it('gives a new account a long random password that nobody chose', () => {
    const one = randomPassword();
    expect(one.length).toBeGreaterThanOrEqual(40);
    expect(randomPassword()).not.toBe(one);
  });
});
