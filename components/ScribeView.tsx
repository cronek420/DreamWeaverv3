import React, { useState, useRef, useEffect } from 'react';
import { connectDreamScribe, closeDreamScribeSession } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { ScribeIcon } from './icons/NavIcons';

interface ScribeViewProps {
  onDreamSubmitted: (dreamText: string) => void;
}

enum ScribeState {
  Idle,
  Connecting,
  Recording,
  Stopped,
  Error,
}

const ScribeView: React.FC<ScribeViewProps> = ({ onDreamSubmitted }) => {
  const [state, setState] = useState<ScribeState>(ScribeState.Idle);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const sessionRef = useRef<any | null>(null);

  const handleMessage = (message: any) => {
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      setTranscript(prev => (prev ? prev + ' ' : '') + text);
    }
  };

  const handleError = (e: ErrorEvent) => {
    console.error('Live session error:', e);
    setError('A connection error occurred. Please try again.');
    setState(ScribeState.Error);
    closeDreamScribeSession(sessionRef.current);
    sessionRef.current = null;
  };

  const handleClose = () => {
    // Session closed by server or user
  };

  const startScribing = async () => {
    setState(ScribeState.Connecting);
    setTranscript('');
    setError('');
    try {
      sessionRef.current = await connectDreamScribe(handleMessage, handleError, handleClose);
      setState(ScribeState.Recording);
    } catch (e) {
      console.error("Failed to start scribe session:", e);
      setError("Could not access microphone. Please check your browser permissions.");
      setState(ScribeState.Error);
    }
  };

  const stopScribing = () => {
    if (sessionRef.current) {
      closeDreamScribeSession(sessionRef.current);
      sessionRef.current = null;
    }
    setState(ScribeState.Stopped);
  };

  const handleAnalyze = () => {
    if (transcript.trim()) {
      onDreamSubmitted(transcript);
      // Reset state for next time
      setTranscript('');
      setState(ScribeState.Idle);
    }
  }

  const reset = () => {
    stopScribing();
    setTranscript('');
    setError('');
    setState(ScribeState.Idle);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        closeDreamScribeSession(sessionRef.current);
      }
    };
  }, []);

  const renderContent = () => {
    switch (state) {
      case ScribeState.Connecting:
        return (
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p>Connecting to scribe...</p>
          </div>
        );
      case ScribeState.Recording:
        return (
          <>
            <p className="text-lg text-[#C7D0D8]/80 text-center mb-4">I'm listening...</p>
            <div className="w-full min-h-[150px] bg-[#1a1c2e] text-[#C7D0D8] p-4 rounded-lg border border-[#6C63FF]/50">
              {transcript || <span className="text-gray-400">Your dream will appear here as you speak.</span>}
            </div>
            <button
              onClick={stopScribing}
              className="mt-6 w-full h-12 bg-gradient-to-r from-[#FF00A0] to-red-500 text-white font-bold rounded-lg"
            >
              Stop Scribing
            </button>
          </>
        );
      case ScribeState.Stopped:
        return (
          <>
            <h3 className="text-xl font-bold text-white mb-2">Your Dream Transcript</h3>
            <p className="text-sm text-[#C7D0D8]/70 mb-4">Review and edit if needed, then analyze.</p>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full h-48 bg-[#1a1c2e] text-[#C7D0D8] p-4 rounded-lg border border-[#6C63FF]/50 focus:ring-2 focus:ring-[#00FFF7] focus:border-[#00FFF7] outline-none transition-colors resize-none"
            />
            <div className="flex gap-4 mt-4">
              <button onClick={reset} className="w-full h-12 bg-gray-600 text-white font-bold rounded-lg">
                Discard
              </button>
              <button onClick={handleAnalyze} disabled={!transcript.trim()} className="w-full h-12 bg-gradient-to-r from-[#6C63FF] to-[#00FFF7] text-white font-bold rounded-lg disabled:opacity-50">
                Analyze Dream
              </button>
            </div>
          </>
        );
      case ScribeState.Error:
        return (
          <div className="text-center">
            <p className="text-red-400">{error}</p>
            <button onClick={reset} className="mt-4 px-4 py-2 bg-gray-600 text-white font-bold rounded-lg">
              Try Again
            </button>
          </div>
        );
      case ScribeState.Idle:
      default:
        return (
          <>
            <ScribeIcon className="w-16 h-16 text-[#6C63FF] mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Voice Your Dreams</h2>
            <p className="text-lg text-center text-[#C7D0D8]/80 mb-8">Tap the button below and begin speaking to record your dream with your voice.</p>
            <button
              onClick={startScribing}
              className="w-full h-14 bg-gradient-to-r from-[#6C63FF] to-[#00FFF7] text-white font-bold rounded-lg"
            >
              Start Scribing
            </button>
          </>
        );
    }
  };

  return (
    <div className="py-4 flex flex-col items-center justify-center text-center min-h-[60vh]">
      {renderContent()}
    </div>
  );
};

export default ScribeView;