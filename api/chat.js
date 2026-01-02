// /api/chat.js
// Vercel Serverless Function (Node runtime)
// 필요 패키지: @google/generative-ai
// env: GEMINI_API_KEY

import { GoogleGenerativeAI } from "@google/generative-ai";

// 모델이 JSON만 뱉도록 강하게 유도 + 혹시 섞이면 배열만 뽑아내는 방어
function extractJsonArray(text) {
  const raw = String(text || "").trim();
  // 이미 JSON 배열이면 그대로
  if (raw.startsWith("[") && raw.endsWith("]")) return raw;

  // 코드펜스 제거
  const noFence = raw
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  // 배열 형태만 추출
  const m = noFence.match(/\[[\s\S]*\]/);
  return m ? m[0].trim() : "[]";
}

function buildPrompt({ userText, memory, characters }) {
  const charLines = (Array.isArray(characters) ? characters : [])
    .map((c) => {
      const id = (c?.id ?? "").trim();
      const name = (c?.name ?? "").trim();
      const style = (c?.style ?? "").trim();
      return `- ${id}: ${name} / 말투: ${style}`;
    })
    .filter(Boolean)
    .join("\n");

  const safeMemory = String(memory || "")
    .split("\n")
    .slice(-20) // 너무 길면 비용↑, 최근만
    .join("\n");

  return `
너는 "AI 단톡방 시뮬레이터"다. 엔딩 없이 일상 대화를 계속한다.

# 절대 규칙(중요)
- 이번 턴에는 1~3명만 말한다.
- 각 메시지는 1~2문장. 너무 길게 금지.
- 캐릭터 말투/성격을 유지한다.
- 서로 자연스럽게 이어받는다(단톡 느낌).
- 과도한 질문 폭탄 금지(질문은 최대 1명만).
- 공격적/혐오/위험한 내용은 피하고, 일상 대화로 부드럽게 전환한다.

# 출력 형식(반드시 지켜)
오직 JSON 배열만 출력한다. 다른 텍스트/설명/코드펜스 금지.
예:
[
  {"speaker":"mina","text":"..."},
  {"speaker":"juno","text":"..."}
]

# 캐릭터
${charLines || "- (캐릭터 정보 없음)"}

# 최근 대화(요약/로그)
${safeMemory || "없음"}

# 유저 메시지
${String(userText || "").trim()}
`.trim();
}

export default async function handler(req, res) {
  // CORS(필요 시)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });

    const { userText, memory, characters } = req.body || {};
    if (!userText || typeof userText !== "string") {
      return res.status(400).json({ ok: false, error: "userText is required" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // 빠르고 저렴한 모델 추천(대화용): gemini-1.5-flash
    // 필요하면 gemini-1.5-pro로 바꿔도 됨.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = buildPrompt({ userText, memory, characters });

    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() ?? "";

    const jsonArrayText = extractJsonArray(text);

    return res.status(200).json({
      ok: true,
      data: jsonArrayText, // 프론트에서 JSON.parse(data.data)
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
}
