import { getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

export interface Worker {
  uid: string;
  name: string;
  email?: string;
}

// The signed-in worker, with the name saved in colaboradores. Null without a session.
export async function currentWorker(): Promise<Worker | null> {
  if (getApps().length === 0) return null;
  const auth = getAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  let name = user.displayName || user.email || 'Trabajador';
  try {
    const nombre: unknown = (await getDoc(doc(getFirestore(), 'colaboradores', user.uid))).data()?.['nombre'];
    if (typeof nombre === 'string' && nombre.trim()) name = nombre.trim();
  } catch {
    // Keeps the email as the name if the profile cannot be read.
  }
  return { uid: user.uid, name, email: user.email ?? undefined };
}
