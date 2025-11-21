import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob, Part } from "@google/genai";
import { DreamAnalysis, Dream } from '../types';

const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  throw new Error("VITE_API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey });

// --- Audio Helper Functions ---

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export interface AnalysisOptions {
  narrative: boolean;
  archetypes: boolean;
  symbols: boolean;
}

const baseAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    themes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of 3-5 main themes or subjects in the dream (e.g., 'flying', 'being chased')."
    },
    emotions: {
      type: Type.OBJECT,
      properties: {
        joy: { type: Type.NUMBER, description: "Score from 0.0 to 1.0 representing joy." },
        fear: { type: Type.NUMBER, description: "Score from 0.0 to 1.0 representing fear." },
        sadness: { type: Type.NUMBER, description: "Score from 0.0 to 1.0 representing sadness." },
        anger: { type: Type.NUMBER, description: "Score from 0.0 to 1.0 representing anger." },
        surprise: { type: Type.NUMBER, description: "Score from 0.0 to 1.0 representing surprise." },
        anxiety: { type: Type.NUMBER, description: "Score from 0.0 to 1.0 representing anxiety." },
      },
      description: "A scoring of key emotions present in the dream, from 0.0 to 1.0."
    },
    summary: {
      type: Type.STRING,
      description: "A concise, one-sentence summary of the dream's narrative."
    },
    interpretation: {
      type: Type.STRING,
      description: "A thoughtful, psychological interpretation of the dream, exploring what the symbols and narrative might represent in the user's waking life. Keep it grounded and avoid overly mystical language. If context from previous dreams is provided, reference any recurring patterns or themes."
    },
    prompts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of 2-3 open-ended reflection questions to help the user think deeper about the dream (e.g., 'What in your life feels like an endless chase?')."
    },
  },
  required: ["themes", "emotions", "summary", "interpretation", "prompts"],
};


export const analyzeDream = async (dreamText: string, previousDreams: Dream[], options: AnalysisOptions): Promise<DreamAnalysis> => {
  let systemInstruction = `You are a dream analyst AI. Provide a detailed analysis of the user's new dream based on psychological principles and common dream symbolism. The tone should be calm, insightful, and scientific, not mystical. If context from previous dreams is provided, look for recurring themes, symbols, or emotional patterns and incorporate this into your analysis of the new dream to provide personalized insights.`;

  const dynamicSchema: any = JSON.parse(JSON.stringify(baseAnalysisSchema)); // Deep copy
  let requestedAnalyses = [];

  if (options.narrative) {
    dynamicSchema.properties.narrativeStructure = {
      type: Type.STRING,
      description: "Analyze the dream's narrative structure. Describe its plot, pacing (e.g., slow, frantic), and overall story arc (e.g., linear, fragmented, cyclical)."
    };
    dynamicSchema.required.push("narrativeStructure");
    requestedAnalyses.push("narrative structure");
  }

  if (options.archetypes) {
    dynamicSchema.properties.characterArchetypes = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nameInDream: { type: Type.STRING, description: "The name or description of the character/entity in the dream (e.g., 'a shadowy figure', 'my mother')." },
          archetype: { type: Type.STRING, description: "The Jungian or common archetype this character represents (e.g., 'The Mentor', 'The Shadow', 'The Anima/Animus')." },
          description: { type: Type.STRING, description: "A brief explanation of why this character fits the archetype and their role in the dream's narrative." }
        },
        required: ["nameInDream", "archetype", "description"]
      },
      description: "Identify key characters or figures in the dream and analyze them based on common archetypes."
    };
    dynamicSchema.required.push("characterArchetypes");
    requestedAnalyses.push("character archetypes");
  }

  if (options.symbols && previousDreams.length > 0) {
    dynamicSchema.properties.recurringSymbols = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          symbol: { type: Type.STRING, description: "The recurring symbol or theme found in the new dream and previous dreams." },
          interpretation: { type: Type.STRING, description: "An interpretation of what this recurring symbol might mean for the user, noting any evolution in its context or appearance." },
          appearances: { type: Type.NUMBER, description: "The total count of how many times this symbol has appeared, including the current dream." }
        },
        required: ["symbol", "interpretation", "appearances"]
      },
      description: "Identify symbols or themes from the new dream that have also appeared in the provided previous dreams. Analyze their significance and potential evolution."
    };
    dynamicSchema.required.push("recurringSymbols");
    requestedAnalyses.push("recurring symbols");
  }

  if (requestedAnalyses.length > 0) {
    systemInstruction += ` In addition to the standard analysis, the user has specifically requested an analysis of the following: ${requestedAnalyses.join(', ')}. Ensure these sections are included in your response.`;
  }

  let userContent = `Analyze this new dream:\n\n"${dreamText}"`;

  if (previousDreams.length > 0) {
    // Take the 3 most recent dreams for context to keep the prompt manageable
    const recentDreams = previousDreams.slice(0, 3);
    const context = recentDreams.map((dream, index) =>
      `Previous Dream ${index + 1}:\n- Summary: ${dream.analysis?.summary || dream.text.substring(0, 100) + '...'}\n- Themes: ${dream.analysis?.themes.join(', ') || 'N/A'}`
    ).join('\n\n');

    userContent += `\n\n---
For additional context, here are the user's most recent dreams. Compare the new dream with these to find connections.

${context}
---`;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", // Using a more powerful model for deeper contextual analysis
      contents: userContent,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: dynamicSchema,
      },
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error analyzing dream with Gemini:", error);
    throw new Error("Failed to get dream analysis from Gemini.");
  }
};

export const continueDreamConversation = async (dream: Dream, newUserMessage: string): Promise<string> => {
  const systemInstruction = `You are a dream analyst continuing a conversation with a user about their dream.
  The user's dream was: "${dream.text}"
  Your initial analysis was: ${JSON.stringify(dream.analysis)}
  
  Now, engage with the user's follow-up questions based on the conversation history. Provide thoughtful, concise, and helpful responses that build upon the initial analysis.`;

  const history: any[] = (dream.chatHistory || []).map(message => ({
    role: message.role,
    parts: [{ text: message.content }],
  }));

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...history,
        { role: 'user', parts: [{ text: newUserMessage }] }
      ],
      config: {
        systemInstruction: systemInstruction,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Error continuing dream conversation:", error);
    throw new Error("Failed to get response from Gemini.");
  }
};


export const getCommunityInsights = async (query: string, location: { latitude: number; longitude: number; }) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `As an AI expert on dream patterns, answer the user's question about what people are dreaming about in specific locations. Use the available tools to provide geographically relevant and interesting insights. Query: "${query}"`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: location.latitude,
              longitude: location.longitude
            }
          }
        }
      },
    });

    return {
      text: response.text,
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error("Error fetching community insights:", error);
    throw new Error("Failed to get community insights from Gemini.");
  }
};

export const generateDreamArt = async (prompt: string, aspectRatio: string): Promise<string> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio,
      },
    });

    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return base64ImageBytes;
  } catch (error) {
    console.error("Error generating image with Imagen:", error);
    throw new Error("Failed to generate dream art.");
  }
};

export const generateInsightReport = async (dreams: Dream[]): Promise<string> => {
  const systemInstruction = `You are an expert psychological analyst specializing in dream patterns. The user has provided their dream analyses from a specific period. Synthesize this data into a cohesive report, written in markdown format. Identify the most prominent recurring themes and emotions. Note any shifts or progressions you see over this period. Conclude with a gentle, insightful summary of what their subconscious may be focusing on. Do not give medical advice. The tone should be reflective, empowering, and use headings and lists to be easily readable.`;

  const formattedDreams = dreams.map(dream => (
    `Date: ${dream.timestamp.split(',')[0]}
Mood: ${dream.mood || 'Not recorded'}
Summary: ${dream.analysis?.summary}
Themes: ${dream.analysis?.themes.join(', ')}
Emotions: ${Object.entries(dream.analysis?.emotions || {}).filter(([, score]) => score > 0.2).map(([emotion]) => emotion).join(', ') || 'N/A'}`
  )).join('\n---\n');

  const userContent = `Based on the following dream data, generate a psychological insight report for me:\n\n${formattedDreams}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: userContent,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Error generating insight report:", error);
    throw new Error("Failed to generate insight report from Gemini.");
  }
};

export const getGlobalDreamTrends = async (dreams: Dream[]): Promise<string> => {
  const systemInstruction = "Analyze this anonymized global dream data (simulated from a user's history). Identify the top 3 most significant trends. For each trend, write a short, engaging summary suitable for a public feed. Format the output in markdown with headings for each trend.";

  const themeCounts: Record<string, number> = {};
  dreams.forEach(dream => {
    dream.analysis?.themes.forEach(theme => {
      themeCounts[theme] = (themeCounts[theme] || 0) + 1;
    });
  });

  const aggregatedData = `Top Themes: ${Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([theme, count]) => `${theme} (x${count})`).join(', ')}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: aggregatedData,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Error generating global dream trends:", error);
    throw new Error("Failed to generate global trends from Gemini.");
  }
};


export const connectDreamScribe = async (
  onMessage: (message: LiveServerMessage) => void,
  onError: (e: ErrorEvent) => void,
  onClose: (e: CloseEvent) => void
): Promise<any> => {

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // FIX: Added `(window as any)` to support `webkitAudioContext` for older browsers without causing a TypeScript error.
  const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => {
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);
          sessionPromise.then((session) => {
            session.sendRealtimeInput({ media: pcmBlob });
          });
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: onMessage,
      onerror: onError,
      onclose: onClose,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      systemInstruction: 'You are a dream scribe. Your role is to listen patiently as the user recounts their dream. Do not interrupt or ask questions. Your primary goal is to make the user feel comfortable sharing their dream while you transcribe it.',
    },
  });

  // Store references for cleanup
  const session = await sessionPromise;
  (session as any)._stream = stream;
  (session as any)._audioContext = inputAudioContext;

  return session;
};

export const closeDreamScribeSession = (session: any | null) => {
  if (!session) return;

  const stream = (session as any)._stream;
  if (stream) {
    stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  }

  const audioContext = (session as any)._audioContext;
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }

  session.close();
};