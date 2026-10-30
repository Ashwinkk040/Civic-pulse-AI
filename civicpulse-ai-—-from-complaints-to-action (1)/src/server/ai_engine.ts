import { GoogleGenAI, Type } from '@google/genai';
import { ComplaintCategory, SUPPORTED_CATEGORIES } from '../shared/types.ts';

export interface CategorizationResult {
  predicted_category: ComplaintCategory;
  final_category: ComplaintCategory;
  citizen_category: string | null;
  confidence: number;
  method: string;
  needs_review: boolean;
  detected_categories: ComplaintCategory[];
  reasoning: string;
}

export interface SummarizationResult {
  summary: string;
  method: string;
}

const CATEGORY_LEXICON: Record<ComplaintCategory, Array<{ term: string; weight: number }>> = {
  'Road Damage': [
    { term: 'pothole', weight: 3.0 },
    { term: 'potholes', weight: 3.0 },
    { term: 'crater', weight: 2.5 },
    { term: 'asphalt', weight: 2.2 },
    { term: 'pavement', weight: 2.0 },
    { term: 'sinkhole', weight: 2.8 },
    { term: 'road surface', weight: 2.5 },
    { term: 'broken road', weight: 2.8 },
    { term: 'damaged road', weight: 2.8 },
    { term: 'speed breaker', weight: 1.8 },
    { term: 'divider', weight: 1.5 },
    { term: 'tar', weight: 1.4 },
    { term: 'carriageway', weight: 2.0 },
    { term: 'footpath', weight: 1.6 },
  ],
  Waterlogging: [
    { term: 'waterlogging', weight: 3.2 },
    { term: 'waterlogged', weight: 3.2 },
    { term: 'flooding', weight: 2.8 },
    { term: 'flooded', weight: 2.8 },
    { term: 'stagnant water', weight: 2.6 },
    { term: 'submerged', weight: 2.5 },
    { term: 'knee-deep water', weight: 3.0 },
    { term: 'ankle-deep', weight: 2.6 },
    { term: 'standing water', weight: 2.5 },
    { term: 'inundated', weight: 2.6 },
    { term: 'rainwater accumulation', weight: 2.8 },
    { term: 'water accumulation', weight: 2.5 },
  ],
  'Waste Management': [
    { term: 'garbage', weight: 3.0 },
    { term: 'trash', weight: 2.8 },
    { term: 'rubbish', weight: 2.8 },
    { term: 'dump', weight: 2.4 },
    { term: 'dumping', weight: 2.5 },
    { term: 'overflowing bin', weight: 3.2 },
    { term: 'dustbin', weight: 2.8 },
    { term: 'waste', weight: 2.5 },
    { term: 'uncollected', weight: 2.2 },
    { term: 'foul smell', weight: 1.8 },
    { term: 'stench', weight: 1.8 },
    { term: 'litter', weight: 2.0 },
    { term: 'debris pile', weight: 2.0 },
    { term: 'compactor', weight: 2.0 },
  ],
  Drainage: [
    { term: 'drain', weight: 2.8 },
    { term: 'drainage', weight: 3.0 },
    { term: 'sewer', weight: 3.0 },
    { term: 'sewage', weight: 3.2 },
    { term: 'stormwater', weight: 2.6 },
    { term: 'culvert', weight: 2.8 },
    { term: 'gutter', weight: 2.5 },
    { term: 'blocked drain', weight: 3.2 },
    { term: 'clogged drain', weight: 3.2 },
    { term: 'overflowing drain', weight: 3.0 },
    { term: 'choked', weight: 2.0 },
    { term: 'manhole overflow', weight: 2.8 },
    { term: 'silt', weight: 1.8 },
  ],
  Streetlight: [
    { term: 'streetlight', weight: 3.2 },
    { term: 'streetlights', weight: 3.2 },
    { term: 'street light', weight: 3.2 },
    { term: 'street lamp', weight: 3.0 },
    { term: 'lamp post', weight: 2.8 },
    { term: 'lamppost', weight: 2.8 },
    { term: 'flickering', weight: 2.2 },
    { term: 'pitch dark', weight: 2.4 },
    { term: 'unlit', weight: 2.4 },
    { term: 'light pole', weight: 2.8 },
    { term: 'led fixture', weight: 2.5 },
    { term: 'bulb out', weight: 2.4 },
  ],
  'Public Safety': [
    { term: 'open manhole', weight: 3.5 },
    { term: 'uncovered manhole', weight: 3.5 },
    { term: 'missing manhole cover', weight: 3.5 },
    { term: 'live wire', weight: 3.5 },
    { term: 'exposed wire', weight: 3.3 },
    { term: 'exposed cable', weight: 3.0 },
    { term: 'electric shock', weight: 3.5 },
    { term: 'fallen tree', weight: 2.8 },
    { term: 'leaning pole', weight: 2.8 },
    { term: 'collapsed wall', weight: 3.0 },
    { term: 'unbarricaded', weight: 2.8 },
    { term: 'open trench', weight: 3.0 },
    { term: 'gas leak', weight: 3.5 },
    { term: 'sparking transformer', weight: 3.4 },
    { term: 'safety hazard', weight: 2.5 },
  ],
  Other: [],
};

export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isValidCategory(cat?: string | null): cat is ComplaintCategory {
  if (!cat) return false;
  return (SUPPORTED_CATEGORIES as string[]).includes(cat);
}

/**
 * Deterministic lexical/rule-based complaint categorization.
 * Clearly labeled as 'deterministic-rule-fallback' (never presented as a trained ML model).
 */
export function categorizeComplaintDeterministic(
  description: string,
  citizenCategory?: string | null
): CategorizationResult {
  const normalized = normalizeText(description);
  const validCitizenCat = isValidCategory(citizenCategory) ? citizenCategory : null;

  const scores: Record<ComplaintCategory, number> = {
    'Road Damage': 0,
    Waterlogging: 0,
    'Waste Management': 0,
    Drainage: 0,
    Streetlight: 0,
    'Public Safety': 0,
    Other: 0,
  };

  for (const category of SUPPORTED_CATEGORIES) {
    if (category === 'Other') continue;
    const rules = CATEGORY_LEXICON[category];
    for (const rule of rules) {
      if (normalized.includes(rule.term)) {
        scores[category] += rule.weight;
      }
    }
  }

  const ranked = (Object.entries(scores) as Array<[ComplaintCategory, number]>)
    .filter(([cat, score]) => cat !== 'Other' && score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    const fallbackCategory: ComplaintCategory = validCitizenCat || 'Other';
    const wordCount = normalized.split(' ').filter(Boolean).length;
    const confidence = validCitizenCat && validCitizenCat !== 'Other' ? 0.55 : 0.35;
    return {
      predicted_category: 'Other',
      final_category: fallbackCategory,
      citizen_category: validCitizenCat,
      confidence,
      method: 'deterministic-rule-fallback',
      needs_review: true,
      detected_categories: [fallbackCategory],
      reasoning:
        wordCount < 5
          ? 'Insufficient descriptive evidence for automated keyword categorization; marked Needs Review.'
          : 'No strong domain terms matched deterministic lexicon; defaulted to citizen selection or Other (Needs Review).',
    };
  }

  const [topCategory, topScore] = ranked[0];
  const secondScore = ranked.length > 1 ? ranked[1][1] : 0;
  const detectedCategories = ranked.filter(([, s]) => s >= 2.0).map(([c]) => c);

  // Calculate normalized confidence in [0.45, 0.94]
  let confidence = Math.min(0.94, 0.5 + topScore * 0.08);
  let needsReview = false;
  let reasoning = `Matched ${topCategory} lexical indicators (score ${topScore.toFixed(1)}).`;

  // Multi-issue ambiguity check
  if (secondScore > 0 && secondScore >= topScore * 0.75) {
    confidence = Math.max(0.48, confidence - 0.22);
    needsReview = true;
    reasoning = `Multiple civic issues detected in description (${topCategory} and ${ranked[1][0]}). Flagged for officer review.`;
  }

  // Citizen category disagreement check
  let finalCategory = topCategory;
  if (validCitizenCat && validCitizenCat !== 'Other' && validCitizenCat !== topCategory) {
    if (topScore < 2.6) {
      finalCategory = validCitizenCat;
      confidence = 0.54;
      needsReview = true;
      reasoning = `Citizen selected "${validCitizenCat}" while lexical rules weakly suggested "${topCategory}". Flagged Needs Review.`;
    } else {
      needsReview = true;
      reasoning += ` Note: Citizen originally selected "${validCitizenCat}"; retained predicted "${topCategory}" with review flag.`;
    }
  }

  if (confidence < 0.62) {
    needsReview = true;
  }

  return {
    predicted_category: topCategory,
    final_category: finalCategory,
    citizen_category: validCitizenCat,
    confidence: Number(confidence.toFixed(2)),
    method: 'deterministic-rule-fallback',
    needs_review: needsReview,
    detected_categories: detectedCategories.length > 0 ? detectedCategories : [topCategory],
    reasoning,
  };
}

/**
 * Extractive and template-based fallback summary generator.
 * Preserves factual details from the original complaint without inventing details.
 */
export function summarizeComplaintDeterministic(
  description: string,
  category: ComplaintCategory,
  locationName: string
): SummarizationResult {
  const clean = (description || '').trim().replace(/\s+/g, ' ');
  if (!clean) {
    return {
      summary: `[Fallback Summary] ${category} issue reported at ${locationName || 'unspecified location'}.`,
      method: 'extractive-template-fallback',
    };
  }

  // Split into sentences and select the most informative first 1-2 clauses
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let coreExtract = sentences[0] || clean;
  if (coreExtract.length < 65 && sentences.length > 1) {
    coreExtract = `${sentences[0]} ${sentences[1]}`;
  }

  if (coreExtract.length > 160) {
    coreExtract = coreExtract.slice(0, 157).trim() + '...';
  }

  const locPrefix = locationName ? `${locationName}: ` : '';
  const summary = `${locPrefix}${coreExtract}`;

  return {
    summary,
    method: 'extractive-template-fallback',
  };
}

function hasValidGeminiApiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 10 && key !== 'MY_GEMINI_API_KEY');
}

/**
 * Combined AI processing pipeline: attempts Gemini ('gemini-3.8-flash') when configured
 * with a strict timeout, falling back safely to deterministic categorization and extractive summary.
 */
export async function processComplaintTextAI(
  description: string,
  locationName: string,
  citizenCategory?: string | null,
  enableExternalAI: boolean = true
): Promise<{
  categorization: CategorizationResult;
  summarization: SummarizationResult;
}> {
  const detCategorization = categorizeComplaintDeterministic(description, citizenCategory);
  const detSummarization = summarizeComplaintDeterministic(
    description,
    detCategorization.final_category,
    locationName
  );

  if (!enableExternalAI || !hasValidGeminiApiKey()) {
    return {
      categorization: detCategorization,
      summarization: detSummarization,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout after 4500ms')), 4500)
    );

    const aiPromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Analyze this municipal civic complaint report and return factual JSON.
Location: ${locationName || 'Unspecified'}
Citizen Selected Category: ${citizenCategory || 'None'}
Description: ${description}`,
      config: {
        systemInstruction:
          'You are a municipal operations classifier. Classify into one of: "Road Damage", "Waterlogging", "Waste Management", "Drainage", "Streetlight", "Public Safety", "Other". Generate a factual 1-sentence operational summary (max 22 words) without inventing any measurements or facts.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predicted_category: {
              type: Type.STRING,
              description:
                'One of Road Damage, Waterlogging, Waste Management, Drainage, Streetlight, Public Safety, Other',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence score between 0.0 and 1.0',
            },
            needs_review: {
              type: Type.BOOLEAN,
              description:
                'True if multiple distinct issues exist, confidence < 0.65, or evidence is ambiguous',
            },
            summary: {
              type: Type.STRING,
              description: 'Factual 1-sentence officer summary without invented details',
            },
            reasoning: {
              type: Type.STRING,
              description: 'Brief explanation for classification',
            },
          },
          required: ['predicted_category', 'confidence', 'needs_review', 'summary', 'reasoning'],
        },
      },
    });

    const response = await Promise.race([aiPromise, timeoutPromise]);
    const parsed = JSON.parse((response.text ?? '{}').trim());

    const predCat: ComplaintCategory = isValidCategory(parsed.predicted_category)
      ? parsed.predicted_category
      : detCategorization.predicted_category;

    const conf =
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, Number(parsed.confidence.toFixed(2))))
        : detCategorization.confidence;

    const validCitizen = isValidCategory(citizenCategory) ? citizenCategory : null;
    const needsReview =
      Boolean(parsed.needs_review) ||
      conf < 0.62 ||
      Boolean(validCitizen && validCitizen !== 'Other' && validCitizen !== predCat);

    return {
      categorization: {
        predicted_category: predCat,
        final_category: predCat,
        citizen_category: validCitizen,
        confidence: conf,
        method: 'gemini-3.8-flash',
        needs_review: needsReview,
        detected_categories: detCategorization.detected_categories,
        reasoning: parsed.reasoning || detCategorization.reasoning,
      },
      summarization: {
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim().length > 5
            ? parsed.summary.trim()
            : detSummarization.summary,
        method: 'gemini-3.8-flash',
      },
    };
  } catch (err) {
    // Safe fallback when external AI service fails or times out
    return {
      categorization: detCategorization,
      summarization: detSummarization,
    };
  }
}
