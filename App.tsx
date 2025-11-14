import './index.css';
import React, { useState, useCallback, useEffect } from 'react';
import { ActiveTab, Dream, ChatMessage, User, DreamMood } from './types';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import FloatingActionButton from './components/FloatingActionButton';
import DreamEntryModal from './components/DreamEntryModal';
import JournalView from './components/JournalView';
import InsightsView from './components/InsightsView';
import CommunityView from './components/CommunityView';
import ScribeView from './components/ScribeView';
import { analyzeDream, AnalysisOptions } from './services/geminiService';
import LoadingSpinner from './components/LoadingSpinner';
import AuthView from './components/AuthView';
import { onAuthStateChanged, logOut, getDreamsForUser, saveDreamForUser, addChatMessageToDream } from './services/authService';
import UpgradeView from './components/UpgradeView';
import { redirectToCheckout } from './services/paymentService';

// Helper to check if the user has pro access (either via trial or subscription)
export const isProOrTrialActive = (user: User | null): boolean => {
  if (!user) return false;
  if (user.plan === 'pro') return true;
  if (user.trialEndDate) {
    return new Date(user.trialEndDate) > new Date();
  }
  return false;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.Journal);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // For general loading like dream analysis
  const [isAppLoading, setIsAppLoading] = useState(true); // For initial auth/data load
  
  // Auth state: null means no user, User object means logged in
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isPro = isProOrTrialActive(currentUser);

  // Listen for auth state changes on initial load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        const userDreams = await getDreamsForUser(user.id);
        setDreams(userDreams);
      } else {
        setDreams([]);
      }
      setIsAppLoading(false);
    });
    
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const handleAddDream = useCallback(async (dreamText: string, mood?: DreamMood, options?: AnalysisOptions) => {
    if (!currentUser) return;

    // Enforce free plan limit
    if (!isPro) {
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const dreamsThisMonth = dreams.filter(dream => {
        const dreamDate = new Date(dream.id);
        return dreamDate.getMonth() === currentMonth && dreamDate.getFullYear() === currentYear;
      }).length;

      if (dreamsThisMonth >= 5) {
        setIsUpgradeModalOpen(true);
        return;
      }
    }

    setIsLoading(true);
    try {
      const analysisOptions = options || { narrative: false, archetypes: false, symbols: false };
      const analysis = await analyzeDream(dreamText, dreams, analysisOptions);
      const newDream: Dream = {
        id: new Date().toISOString(),
        userId: currentUser.id,
        text: dreamText,
        mood,
        timestamp: new Date().toISOString(), // Use ISO string for consistent sorting
        analysis,
        chatHistory: [],
      };
      
      await saveDreamForUser(currentUser.id, newDream);
      setDreams(prevDreams => [newDream, ...prevDreams]);
      setActiveTab(ActiveTab.Journal);

    } catch (error) {
      console.error("Failed to analyze dream:", error);
      alert("Sorry, we couldn't analyze your dream. Please try again.");
    } finally {
      setIsLoading(false);
      setIsModalOpen(false);
    }
  }, [dreams, currentUser, isPro]);
  
  const handleAddChatMessage = async (dreamId: string, message: ChatMessage) => {
    if (!currentUser) return;

    let updatedHistory: ChatMessage[] = [];
    const updatedDreams = dreams.map(dream => {
      if (dream.id === dreamId) {
        updatedHistory = [...(dream.chatHistory || []), message];
        return { ...dream, chatHistory: updatedHistory };
      }
      return dream;
    });

    setDreams(updatedDreams);
    await addChatMessageToDream(currentUser.id, dreamId, updatedHistory);
  };


  const handleLogout = async () => {
    await logOut();
    // The onAuthStateChanged listener will handle setting currentUser to null
  };

  const handleUpgrade = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      // This function will now redirect the user to Stripe's checkout.
      await redirectToCheckout(currentUser);
      // The user will be redirected away, so we don't need to do much here.
      // If they cancel, they come back. If they succeed, the webhook will update their status.
    } catch (error) {
      console.error("Failed to redirect to checkout:", error);
      alert("Could not connect to the payment service. Please try again.");
      setIsLoading(false); // Only set loading to false if an error occurs before redirect
    }
    // Don't set isLoading to false here, as the page will be redirected.
  };


  const renderActiveView = () => {
    switch (activeTab) {
      case ActiveTab.Journal:
        return <JournalView dreams={dreams} onAddChatMessage={handleAddChatMessage} />;
      case ActiveTab.Insights:
        return <InsightsView dreams={dreams} isPro={isPro} onUpgradeClick={() => setIsUpgradeModalOpen(true)} />;
      case ActiveTab.Community:
        return <CommunityView dreams={dreams} />;
      case ActiveTab.Scribe:
        return <ScribeView onDreamSubmitted={(text) => handleAddDream(text)} />;
      default:
        return <JournalView dreams={dreams} onAddChatMessage={handleAddChatMessage} />;
    }
  };

  // Render a loading spinner while checking auth status
  if (isAppLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Render AuthView if no user is logged in
  if (!currentUser) {
    return <AuthView />;
  }

  // Render the main app if a user is logged in
  return (
    <div className="min-h-screen font-sans antialiased relative">
      <div className="container mx-auto px-4 pb-24 max-w-2xl">
        <Header user={currentUser} onLogout={handleLogout} onUpgradeClick={() => setIsUpgradeModalOpen(true)} />
        <main>{renderActiveView()}</main>
      </div>
      
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      {activeTab !== ActiveTab.Scribe && <FloatingActionButton onClick={() => setIsModalOpen(true)} />}

      {isModalOpen && (
        <DreamEntryModal
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleAddDream}
          isLoading={isLoading}
          isPro={isPro}
          onUpgradeClick={() => setIsUpgradeModalOpen(true)}
        />
      )}

      {isUpgradeModalOpen && (
        <UpgradeView 
          onClose={() => setIsUpgradeModalOpen(false)}
          onUpgrade={handleUpgrade}
          isLoading={isLoading}
          user={currentUser}
        />
      )}
      
      {isLoading && !isModalOpen && !isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
}