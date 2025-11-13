import { User, Dream } from '../types';
import { auth, db } from './firebase';

// --- SESSION MANAGEMENT ---

/**
 * Listens for real-time authentication state changes.
 * @param callback - Function to be called with the user object or null.
 * @returns An unsubscribe function.
 */
export const onAuthStateChanged = (callback: (user: User | null) => void) => {
  return auth.onAuthStateChanged(async (firebaseUser: any) => {
    if (firebaseUser) {
      // User is signed in, get their profile from Firestore
      const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
      if (userDoc.exists) {
        callback(userDoc.data() as User);
      } else {
        // This case might happen if a user is created in Auth but their Firestore doc fails
        // For now, we treat them as logged out.
        callback(null);
      }
    } else {
      // User is signed out
      callback(null);
    }
  });
};

// --- AUTH FUNCTIONS ---

export const signUp = async (email: string, password: string): Promise<User> => {
  const userCredential = await auth.createUserWithEmailAndPassword(email, password);
  const firebaseUser = userCredential.user;

  if (!firebaseUser) {
    throw new Error("User creation failed.");
  }
  
  const newUser: User = { 
    id: firebaseUser.uid, 
    email: firebaseUser.email!,
    plan: 'free',
  };

  // Create a user document in Firestore to store additional details
  await db.collection('users').doc(firebaseUser.uid).set(newUser);
  
  return newUser;
};

export const logIn = async (email: string, password: string): Promise<User> => {
  const userCredential = await auth.signInWithEmailAndPassword(email, password);
  const firebaseUser = userCredential.user;

  if (!firebaseUser) {
    throw new Error("Login failed.");
  }

  const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
  if (!userDoc.exists) {
      // This is a fallback. If a user exists in Auth but not Firestore,
      // we can create a profile for them.
      const newUserProfile: User = {
          id: firebaseUser.uid,
          email: firebaseUser.email!,
          plan: 'free'
      };
      await db.collection('users').doc(firebaseUser.uid).set(newUserProfile);
      return newUserProfile;
  }

  return userDoc.data() as User;
};

export const logOut = (): Promise<void> => {
  return auth.signOut();
};

// --- USER-SPECIFIC DATA MANAGEMENT ---

export const getDreamsForUser = async (userId: string): Promise<Dream[]> => {
  const dreamsSnapshot = await db.collection('users').doc(userId).collection('dreams')
    .orderBy('timestamp', 'desc')
    .get();
  
  return dreamsSnapshot.docs.map(doc => doc.data() as Dream);
};

export const saveDreamForUser = async (userId:string, dream: Dream): Promise<void> => {
    await db.collection('users').doc(userId).collection('dreams').doc(dream.id).set(dream);
}

export const saveAllDreamsForUser = async (userId: string, dreams: Dream[]): Promise<void> => {
  const batch = db.batch();
  const dreamsCollection = db.collection('users').doc(userId).collection('dreams');

  dreams.forEach(dream => {
    const docRef = dreamsCollection.doc(dream.id);
    batch.set(docRef, dream);
  });

  await batch.commit();
};


export const addChatMessageToDream = async (userId: string, dreamId: string, chatHistory: any): Promise<void> => {
    const dreamRef = db.collection('users').doc(userId).collection('dreams').doc(dreamId);
    await dreamRef.update({ chatHistory });
}