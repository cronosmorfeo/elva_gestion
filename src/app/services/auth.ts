import { Injectable } from '@angular/core';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Obtenemos las instancias directamente ya que Firebase ya fue inicializado en main.ts
  private auth = getAuth();
  private firestore = getFirestore();

  async login(correo: string, password: string): Promise<{ success: boolean; tipo_colaborador?: string; error?: string }> {
    try {
      // 1. Iniciar sesión en Firebase Auth
      const userCredential = await signInWithEmailAndPassword(this.auth, correo.trim(), password);
      const uid = userCredential.user.uid;

      // 2. Consultar la colección 'colaboradores' en Firestore
      const docRef = doc(this.firestore, `colaboradores/${uid}`);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await signOut(this.auth);
        return { success: false, error: 'El usuario está autenticado, pero no existe su registro en colaboradores.' };
      }

      const data = docSnap.data();

      // 3. Validar si el campo 'activo' es true
      if (data['activo'] !== true) {
        await signOut(this.auth);
        return { success: false, error: 'Tu cuenta se encuentra inactiva. Comunícate con soporte.' };
      }

      // 4. Retornar éxito y el tipo de colaborador
      return { 
        success: true, 
        tipo_colaborador: data['tipo_colaborador'] || 'regular' 
      };

    } catch (error: any) {
      console.error('Error de autenticación:', error);
      
      let errorMessage = 'Correo o contraseña incorrectos.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        errorMessage = 'Credenciales inválidas. Verifica tus datos.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Contraseña incorrecta.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'El formato del correo electrónico no es válido.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Demasiados intentos fallidos. Intenta más tarde.';
      }

      return { success: false, error: errorMessage };
    }
  }

  async logout() {
    await signOut(this.auth);
  }
}