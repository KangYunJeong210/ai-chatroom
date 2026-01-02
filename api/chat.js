// /api/chat.js
export const config = { runtime: "nodejs" };

import { GoogleGenerativeAI } from "@google/generative-ai";

function extractJsonArray(text) {
  const raw = String(text || "").trim();
  const noFence = raw.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const m = noFence.match(/\[[\s\S]*\]/);
  return m ? m[0].trim() : "[]";
}

function buildPrompt({ userText, memory, characters }) {
  const charLines = (Array.isArray(characters) ? characters : [])
    .map((c) => `- ${String(c?.id || "").trim()}: ${String(c?.name || "").trim()} / 말투: ${String(c?.style || "").trim()}`)
    .join("\n");

  const safeMemory = String(memory || "").split("\n").slice(-30).join("\n");

  return `
너는 "AI 단톡방 시뮬레이터"다. 엔딩 없이 일상 대화를 계속한다.

규칙:
- 이번 턴에는 1~2명만 말한다.
- 각 메시지는 1~2문장. 짧게.
- 말투/성격 유지. 서로 자연스럽게 이어받기.
- 출력은 반드시 JSON 배열만. 다른 텍스트 금지.

형식:
[
  {"speaker":"mina","text":"..."},
  {"speaker":"juno","text":"..."}
]

캐릭터:
${charLines || "- 없음"}

기억:
${safeMemory || "없음"}

유저:
${String(userText || "").trim()}
`.trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });

    const { userText, memory, characters } = req.body || {};
    if (!userText || typeof userText !== "string") {
      return res.status(400).json({ ok: false, error: "userText is required" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 서버 타임아웃 방어(25초)
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25000);

    const prompt = buildPrompt({ userText, memory, characters });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 220, temperature: 0.8 },
      signal: controller.signal,
    }).finally(() => clearTimeout(t));

    const text = result?.response?.text?.() ?? "";
    const jsonArrayText = extractJsonArray(text);

    return res.status(200).json({ ok: true, data: jsonArrayText });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
