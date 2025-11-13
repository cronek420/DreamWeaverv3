import React, { useState } from 'react';
import { Dream, ChatMessage } from '../types';
import { generateDreamArt, continueDreamConversation } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { ImageIcon, ShareIcon, CloseIcon } from './icons/ActionIcons';
import { HappyIcon, CalmIcon, SadIcon, FearfulIcon } from './icons/AppIcons';

interface DreamCardProps {
  dream: Dream;
  onAddChatMessage: (dreamId: string, message: ChatMessage) => void;
}

const DreamCard: React.FC<DreamCardProps> = ({ dream, onAddChatMessage }) => {
  const analysis = dream.analysis;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isArtLoading, setIsArtLoading] = useState(false);
  const [artError, setArtError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  
  const [followUp, setFollowUp] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [shareableCardUrl, setShareableCardUrl] = useState<string | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [isExpanded, setIsExpanded] = useState(false);

  const aspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  
  const moodIcons = {
    Happy: HappyIcon,
    Calm: CalmIcon,
    Sad: SadIcon,
    Fearful: FearfulIcon
  };
  const MoodIcon = dream.mood ? moodIcons[dream.mood] : null;


  const handleGenerateArt = async () => {
    if (!analysis) return;
    setIsArtLoading(true);
    setArtError(null);
    setImageUrl(null);

    // Find the dominant emotion to guide the art's mood
    const emotions = analysis.emotions;
    let dominantEmotion = 'neutral';
    let maxScore = 0;
    for (const [emotion, score] of Object.entries(emotions)) {
      if (typeof score === 'number' && score > maxScore) {
        maxScore = score;
        dominantEmotion = emotion;
      }
    }

    // Create descriptive text for the emotion
    const emotionDescriptors: { [key: string]: string } = {
      joy: 'vibrant, uplifting, with warm and bright glowing colors',
      fear: 'dark, mysterious, using cool and unsettling tones like deep blues and purples',
      sadness: 'somber, melancholic, with muted blue and gray colors',
      anger: 'chaotic, intense, with sharp, jagged lines and deep red hues',
      surprise: 'dynamic, high-contrast, with bright, unexpected flashes of color',
      anxiety: 'tense, distorted, with swirling, uneasy patterns',
    };

    const emotionalTone = emotionDescriptors[dominantEmotion] || 'balanced and calm';

    // Construct the new, more detailed prompt
    const prompt = `A digital art piece capturing a dream. The dream's main subject is: "${analysis.summary}". Key themes to visualize are: ${analysis.themes.join(', ')}. The emotional atmosphere is ${dominantEmotion}, so the art should have a ${emotionalTone} mood. The style is simple, elegant neon line art on a dark, deep space background. The lines should be glowing and ethereal. Minimalist, but evocative.`;
    
    try {
      const base64Image = await generateDreamArt(prompt, aspectRatio);
      setImageUrl(`data:image/jpeg;base64,${base64Image}`);
    } catch (error) {
      setArtError("Could not generate art. Please try again.");
    } finally {
      setIsArtLoading(false);
    }
  };

  const wrapText = (
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) => {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
  };

  const handleCreateShareableCard = async () => {
    if (!imageUrl || !analysis) return;
    setIsCreatingCard(true);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        
        const PADDING = 60;
        const TEXT_AREA_HEIGHT = 250; 
        const canvasWidth = 1080;
        const scale = canvasWidth / img.naturalWidth;
        const imgHeight = img.naturalHeight * scale;
        
        canvas.width = canvasWidth;
        canvas.height = imgHeight + TEXT_AREA_HEIGHT;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsCreatingCard(false);
          return;
        }

        // Background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0B0C10');
        gradient.addColorStop(1, '#1a1c2e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Image
        ctx.drawImage(img, 0, 0, canvas.width, imgHeight);

        // Text Content
        const textX = PADDING / 2;
        const textY = imgHeight + PADDING;
        const maxWidth = canvas.width - PADDING;

        // Summary
        ctx.fillStyle = '#C7D0D8';
        ctx.font = 'italic 32px sans-serif';
        wrapText(ctx, `"${analysis.summary}"`, textX, textY, maxWidth, 40);

        // Themes
        ctx.font = 'bold 28px sans-serif';
        const themesText = 'Themes: ' + analysis.themes.join(', ');
        wrapText(ctx, themesText, textX, textY + 80, maxWidth, 36);
        
        // Branding
        ctx.fillStyle = '#6C63FF';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('DreamWeaver', canvas.width - PADDING / 2, canvas.height - PADDING/2);
        
        setShareableCardUrl(canvas.toDataURL('image/jpeg'));
        setIsShareModalOpen(true);
        setIsCreatingCard(false);
    };
    img.onerror = () => {
        setIsCreatingCard(false);
        setArtError("Could not load image to create card.");
    }
  };


  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim() || isChatLoading) return;

    setIsChatLoading(true);
    const userMessage: ChatMessage = { role: 'user', content: followUp };
    onAddChatMessage(dream.id, userMessage);
    setFollowUp('');

    try {
      const modelResponse = await continueDreamConversation(dream, followUp);
      const modelMessage: ChatMessage = { role: 'model', content: modelResponse };
      onAddChatMessage(dream.id, modelMessage);
    } catch (error) {
      const errorMessage: ChatMessage = { role: 'model', content: "Sorry, I couldn't process that. Please try again." };
      onAddChatMessage(dream.id, errorMessage);
    } finally {
      setIsChatLoading(false);
    }
  };

  const getFormattedDate = (isoString: string) => {
      try {
          return new Date(isoString).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
          });
      } catch (e) {
          return "Invalid Date";
      }
  };

  return (
    <>
    <div className="bg-[#1a1c2e]/50 border border-[#6C63FF]/10 rounded-xl p-4 transition-all duration-300">
      <div className="flex justify-between items-start cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start gap-3">
          {MoodIcon && <MoodIcon className="w-6 h-6 mt-1 text-white/80"/>}
          <div>
            <h3 className="text-md font-semibold text-white pr-4">{analysis?.summary || "A new dream"}</h3>
             <p className="text-xs text-gray-500 mt-1">{getFormattedDate(dream.timestamp)}</p>
          </div>
        </div>
        <p className={`text-xs text-gray-400 font-semibold transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</p>
      </div>
      
      {isExpanded && analysis && (
        <div className="mt-4 space-y-4 animate-fade-in">
          
          <div className="space-y-4">
             <div className="p-4 bg-[#0B0C10]/50 rounded-lg border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Interpretation</h4>
                <p className="text-sm text-gray-300 leading-relaxed">{analysis.interpretation}</p>
             </div>

            {analysis.narrativeStructure && (
              <div className="p-4 bg-[#0B0C10]/50 rounded-lg border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Narrative Structure</h4>
                <p className="text-sm text-gray-300 leading-relaxed">{analysis.narrativeStructure}</p>
              </div>
            )}
            
            {analysis.characterArchetypes && analysis.characterArchetypes.length > 0 && (
              <div className="p-4 bg-[#0B0C10]/50 rounded-lg border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Character Archetypes</h4>
                <ul className="space-y-3">
                  {analysis.characterArchetypes.map((char, index) => (
                    <li key={index}>
                      <p><strong className="text-white">{char.archetype}</strong> as <span className="italic">"{char.nameInDream}"</span></p>
                      <p className="text-sm text-gray-400 pl-2 border-l-2 border-cyan-400/30 ml-2 mt-1">{char.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recurringSymbols && analysis.recurringSymbols.length > 0 && (
              <div className="p-4 bg-[#0B0C10]/50 rounded-lg border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Recurring Symbols</h4>
                <ul className="space-y-3">
                  {analysis.recurringSymbols.map((symbol, index) => (
                    <li key={index}>
                      <p><strong className="text-white">{symbol.symbol}</strong> <span className="text-xs bg-cyan-400/10 text-cyan-300 px-2 py-0.5 rounded-full">Appeared {symbol.appearances} times</span></p>
                      <p className="text-sm text-gray-400 pl-2 border-l-2 border-cyan-400/30 ml-2 mt-1">{symbol.interpretation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}


             <div className="p-4 bg-[#0B0C10]/50 rounded-lg border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Dream Art</h4>
                {isArtLoading ? (
                  <div className="flex justify-center items-center h-48 bg-[#0B0C10] rounded-lg">
                    <div className="text-center">
                        <LoadingSpinner />
                        <p className="text-sm mt-2 text-gray-400">Generating your vision...</p>
                    </div>
                  </div>
                ) : imageUrl ? (
                  <div className="mb-4">
                    <img src={imageUrl} alt="AI generated dream art" className="rounded-lg w-full object-cover" />
                  </div>
                ) : null}
                
                {artError && !isArtLoading && (
                  <div className="my-2 text-center text-red-400 text-sm p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                    {artError}
                  </div>
                )}

                <div className="space-y-3">
                    <div className="flex justify-center gap-2">
                    {aspectRatios.map(ratio => (
                        <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`px-3 py-1 text-xs rounded-full border transition-colors ${ aspectRatio === ratio ? 'bg-[#00FFF7] text-[#0B0C10] border-[#00FFF7] font-semibold' : 'bg-transparent border-[#6C63FF]/50 text-gray-300 hover:bg-[#6C63FF]/10'}`}>
                        {ratio}
                        </button>
                    ))}
                    </div>
                    <div className="flex items-center gap-3">
                    <button onClick={handleGenerateArt} disabled={isArtLoading} className="w-full h-10 bg-[#6C63FF]/20 text-gray-300 font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-[#6C63FF]/40 transition-colors">
                        <ImageIcon className="w-5 h-5" />
                        {imageUrl ? 'Regenerate' : 'Generate Art'}
                    </button>

                    {imageUrl && (
                        <button onClick={handleCreateShareableCard} disabled={isCreatingCard} className="w-full h-10 bg-[#00FFF7]/20 text-gray-300 font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-[#00FFF7]/40 transition-colors disabled:opacity-50">
                        {isCreatingCard ? <LoadingSpinner/> : <><ShareIcon className="w-5 h-5" /> Create Card</>}
                        </button>
                    )}
                    </div>
                </div>
              </div>
          </div>
          
          <div className="border-t border-[#6C63FF]/10 pt-4">
            <h4 className="text-sm font-semibold text-white mb-2">Deep Dive</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {dream.chatHistory?.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-gradient-to-br from-[#6C63FF] to-[#a163ff] text-white' : 'bg-[#0B0C10] text-gray-300'}`}>
                           {msg.content}
                        </div>
                    </div>
                ))}
                 {isChatLoading && <div className="flex justify-start"><LoadingSpinner/></div>}
            </div>
             <form onSubmit={handleSendFollowUp} className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  placeholder="Ask a follow-up question..."
                  className="flex-grow bg-[#0B0C10] text-gray-200 p-2 rounded-lg border border-[#6C63FF]/50 focus:ring-1 focus:ring-[#00FFF7] outline-none transition-colors"
                  disabled={isChatLoading}
                />
                <button type="submit" disabled={isChatLoading || !followUp.trim()} className="px-4 bg-[#6C63FF] text-white font-bold rounded-lg disabled:opacity-50">
                  {isChatLoading ? <LoadingSpinner/> : 'Send'}
                </button>
            </form>
          </div>

        </div>
      )}
    </div>

    {isShareModalOpen && shareableCardUrl && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-[#0B0C10]/80 border border-[#6C63FF]/30 rounded-2xl p-6 w-full max-w-lg relative shadow-2xl shadow-[#6C63FF]/20">
          <button onClick={() => setIsShareModalOpen(false)} className="absolute top-4 right-4 text-gray-300 hover:text-white transition-colors">
            <CloseIcon className="h-6 w-6" />
          </button>
          <h2 className="text-2xl font-bold mb-4 text-center text-white">
            Your Shareable Dream Card
          </h2>
          <img src={shareableCardUrl} alt="Shareable dream card" className="rounded-lg w-full object-contain" />
           <a
              href={shareableCardUrl}
              download={`dreamweaver-card-${dream.id}.jpg`}
              className="mt-4 w-full h-12 bg-gradient-to-r from-[#6C63FF] to-[#00FFF7] text-white font-bold rounded-lg flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              Download Image
            </a>
        </div>
      </div>
    )}
    </>
  );
};

export default DreamCard;