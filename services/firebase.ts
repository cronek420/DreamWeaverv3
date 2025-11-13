// IMPORTANT: You must create a Firebase project and add your configuration here.
// Go to your Firebase project settings > General > Your apps > Web app > Firebase SDK snippet > Config.
// For security, it is highly recommended to use environment variables to store this configuration.
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');

// A basic check to ensure the config is not empty.
if (!firebaseConfig.apiKey) {
  console.warn(`Firebase is not configured. Please add your Firebase project's configuration to the 'FIREBASE_CONFIG' environment variable as a JSON string.`);
}

// Mock implementation for when Firebase is not configured, to prevent the app from crashing.
// This allows the app to be fully interactive for demonstration purposes.

// In-memory "database" for mock data
const mockDb = {
  users: new Map<string, any>(), // key: uid, value: { password, email, ... }
  userProfiles: new Map<string, any>(), // key: uid, value: User profile
  dreams: new Map<string, any[]>(), // key: uid, value: Dream[]
};

const mockAuth = {
  _currentUser: null as any,
  _listeners: [] as ((user: any) => void)[],
  
  onAuthStateChanged: (callback: (user: any) => void) => {
    mockAuth._listeners.push(callback);
    // Immediately notify with current state (simulating no user logged in)
    setTimeout(() => callback(mockAuth._currentUser), 100);
    // Return an unsubscribe function
    return () => {
      mockAuth._listeners = mockAuth._listeners.filter(l => l !== callback);
    };
  },

  _notifyListeners: () => {
    // Notify all listeners about the auth state change
    mockAuth._listeners.forEach(l => l(mockAuth._currentUser));
  },

  createUserWithEmailAndPassword: async (email: string, password: string) => {
    if ([...mockDb.userProfiles.values()].some(u => u.email === email)) {
      return Promise.reject({ code: 'auth/email-already-in-use', message: 'An account with this email already exists.' });
    }
    const uid = `mock-uid-${Date.now()}`;
    mockAuth._currentUser = { uid, email };
    // We don't store password in profile, but mock needs it for login
    mockDb.users.set(uid, { password, email, uid });
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);
    mockDb.userProfiles.set(uid, { id: uid, email, plan: 'free', trialEndDate: trialEndDate.toISOString() });
    mockAuth._notifyListeners();
    return { user: mockAuth._currentUser };
  },

  signInWithEmailAndPassword: async (email: string, password: string) => {
    const user = [...mockDb.users.values()].find(u => u.email === email);
    if (user && user.password === password) {
      mockAuth._currentUser = { uid: user.uid, email: user.email };
      mockAuth._notifyListeners();
      return { user: mockAuth._currentUser };
    }
    return Promise.reject({ code: 'auth/wrong-password', message: 'Invalid email or password.' });
  },

  signOut: async () => {
    mockAuth._currentUser = null;
    mockAuth._notifyListeners();
    return Promise.resolve();
  },
};

const mockFirestore = {
  collection: (collectionName: string) => {
    if (collectionName === 'users') {
      return {
        doc: (docId: string) => ({
          get: async () => {
            const userProfile = mockDb.userProfiles.get(docId);
            return {
              exists: !!userProfile,
              data: () => userProfile,
            };
          },
          set: async (data: any) => {
            mockDb.userProfiles.set(docId, data);
          },
          collection: (subCollectionName: string) => {
            if (subCollectionName === 'dreams') {
              return {
                orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => ({ // Chain orderBy
                  get: async () => {
                    let dreams = (mockDb.dreams.get(docId) || []);
                    if (field === 'timestamp' && direction === 'desc') {
                        dreams = dreams.slice().sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    }
                    return { docs: dreams.map((d: any) => ({ data: () => d })) };
                  }
                }),
                doc: (subDocId: string) => ({
                  set: async (data: any) => {
                    const userDreams = mockDb.dreams.get(docId) || [];
                    const existingIndex = userDreams.findIndex(d => d.id === subDocId);
                    if (existingIndex > -1) {
                      userDreams[existingIndex] = data;
                    } else {
                      userDreams.push(data);
                    }
                    mockDb.dreams.set(docId, userDreams);
                  },
                  update: async (data: any) => {
                    const userDreams = mockDb.dreams.get(docId) || [];
                    const dreamIndex = userDreams.findIndex((d: any) => d.id === subDocId);
                    if (dreamIndex > -1) {
                        userDreams[dreamIndex] = { ...userDreams[dreamIndex], ...data };
                        mockDb.dreams.set(docId, userDreams);
                    }
                  },
                }),
              };
            }
            return {};
          },
        }),
      };
    }
    return {};
  },
  batch: () => ({
    set: (docRef: any, data: any) => {
      // The mock doesn't need to implement batching, individual `set` calls work fine.
    },
    commit: () => Promise.resolve(),
  }),
};

const mockFunctions = {
  httpsCallable: (functionName: string) => async (data: any) => {
    if (functionName === 'createStripeCheckoutSession') {
      console.warn("Stripe function is mocked. User will not be redirected to checkout.");
      // Simulating a failed redirect by throwing an error that the UI can catch
      return Promise.reject(new Error("Could not connect to the payment service. (Mock Mode)"));
    }
    return { data: {} };
  }
};

let auth: any = mockAuth;
let db: any = mockFirestore;
let functions: any = mockFunctions;
let app: any = null;

// Only initialize Firebase if the config is available.
// This allows the app to run in environments where the config might not be present (e.g., initial setup).
if (firebaseConfig.apiKey) {
    // These imports are placeholders. In a real environment with a bundler,
    // you would use `import { initializeApp } from "firebase/app";` etc.
    // For this environment, we assume these are globally available or handled by an import map if available.
    // Since they are not in the provided import map, we will have to use a script tag in index.html.
    // I will add those script tags.
    // FIX: Cast window to any to access the globally available firebase object, which is expected to be loaded via a script tag.
    app = (window as any).firebase.initializeApp(firebaseConfig);
    auth = (window as any).firebase.auth();
    db = (window as any).firebase.firestore();
    functions = (window as any).firebase.functions();
}


export { app, auth, db, functions };