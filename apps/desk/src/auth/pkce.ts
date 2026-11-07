/**
 * PKCE for the account app's OAuth 2.1 hand-off. The verifier lives in
 * sessionStorage only long enough to survive the redirect and back.
 */
const VERIFIER_KEY = 'elva:desk:pkce:verifier';
const STATE_KEY = 'elva:desk:pkce:state';

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function random(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return base64url(a);
}

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

export function canUsePkce(): boolean {
  return Boolean(globalThis.crypto?.subtle);
}

export async function createPkce(): Promise<Pkce> {
  const verifier = random(32);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(digest), state: random(16) };
}

export function storePkce(p: Pkce): void {
  try {
    sessionStorage.setItem(VERIFIER_KEY, p.verifier);
    sessionStorage.setItem(STATE_KEY, p.state);
  } catch {
    /* the redeem will fail the state check and the user restarts */
  }
}

export function takePkce(): { verifier: string | null; state: string | null } {
  try {
    const out = {
      verifier: sessionStorage.getItem(VERIFIER_KEY),
      state: sessionStorage.getItem(STATE_KEY),
    };
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return out;
  } catch {
    return { verifier: null, state: null };
  }
}
