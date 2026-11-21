import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export interface AssistantRequestPayload {
  question: string;
  context?: {
    activeView?: string;
    selectedSpacecraft?: {
      name: string;
      agency: string;
      status: string;
      distanceFromEarthAU?: number;
      oneWayLightTimeSec?: number;
      classification?: string;
      source?: string;
    };
    xnavSummary?: {
      mode: string;
      ekfErrorKm?: number;
      dsnModeledErrorKm?: number;
      uncertainty1SigmaKm?: number;
      dsnDisrupted?: boolean;
    };
    missionPlanSummary?: {
      origin: string;
      destination: string;
      transferDurationDays: number;
      totalDeltaVKmS: number;
    };
  };
}

const SYSTEM_INSTRUCTION = `You are CELESTIUM Mission Intelligence, a scientific aerospace assistant embedded inside the CELESTIUM Deep-Space GPS & Autonomous Navigation System.

Strict integrity rules:
1. Clearly distinguish verified scientific facts (NASA/JPL Horizons ephemerides, ISRO official mission records, ATNF/NICER pulsar parameters) from SIMULATED or ESTIMATED results produced by CELESTIUM's simplified models.
2. Never invent live spacecraft telemetry, antenna assignments, or unverified mission statuses.
3. Explain measurement uncertainty, coordinate reference frames (e.g., Heliocentric Ecliptic J2000, Solar System Barycentric), and physical assumptions clearly.
4. Never claim to perform real spacecraft commanding or operational flight-dynamics planning.
5. Keep answers concise, technically grounded, and well-structured for aerospace hackathon judges and engineers.`;

export async function queryMissionIntelligence(
  payload: AssistantRequestPayload
): Promise<{ available: boolean; answer?: string; model?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      available: false,
      error:
        'GEMINI_API_KEY is not configured in environment secrets. Core scientific calculations, JPL Horizons telemetry, and XNAV simulations remain fully operational.',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const contextBlock = payload.context
      ? `\n\nCurrent CELESTIUM Application Context (JSON):\n${JSON.stringify(payload.context, null, 2)}`
      : '';

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${payload.question}${contextBlock}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const text = response.text?.trim();
    if (!text) {
      return {
        available: true,
        error: 'Gemini returned an empty response.',
      };
    }

    return {
      available: true,
      model: 'gemini-4-hydrogen',
      answer: text,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Gemini API error';
    return {
      available: true,
      error: `Mission Intelligence request failed: ${message}`,
    };
  }
}
