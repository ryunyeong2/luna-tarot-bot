import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function buildPrompt({ topic, picks }) {
  const list = picks.map((c, i) => `${i+1}) ${c.name} (${c.orientation === "upright" ? "정위" : "역위"})`).join("\n");
  return `
너는 엔터테인먼트용 타로 리더야.
- 따뜻하고 구체적으로, 과장/단정 금지.
- 카드별 핵심 1줄씩.
- 전체 흐름 2~3문장, 오늘의 조언 1~2문장.
- 마지막에 "본 서비스는 엔터테인먼트용입니다." 추가.

[리딩 주제]: ${topic}
[뽑힌 카드]
${list}

[출력 형식]
제목 1줄
카드별 해석 1줄씩
전체 흐름 2~3문장
오늘의 조언 1~2문장
엔터테인먼트 고지 1줄
`.trim();
}

export default async function handler(req, res) {
  try {
    // 1) 카드 로드 (경로 수정됨 ✅)
    const filePath = path.join(process.cwd(), "api", "cards.json");
    const cards = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // 2) 파라미터
    const body = req.body || {};
    const params = body.action?.params || {};
    const count = Number(params.count || 1);      // 1/3/7 등
    const topic = (params.topic || "general");    // general/love/money/career 등

    // 3) 랜덤 뽑기 (+ 정/역위)
    const picks = [];
    for (let i = 0; i < count; i++) {
      const c = cards[Math.floor(Math.random() * cards.length)];
      const orientation = Math.random() < 0.45 ? "reversed" : "upright";
      picks.push({ name: c.name, orientation });
    }

    // 4) AI 해석 요청
    const prompt = buildPrompt({ topic, picks });
    let aiText = "";
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",       // ✅ 안정적 모델로 변경
          temperature: 0.8,
          messages: [
            { role: "system", content: "You are a helpful Korean tarot reader for entertainment." },
            { role: "user", content: prompt }
          ]
        })
      });
      const data = await resp.json();
      aiText = data?.choices?.[0]?.message?.content?.trim();
    } catch {
      aiText = null;
    }

    // 5) 실패 시 기본 응답
    if (!aiText) {
      const lines = picks.map((c, i) => `${i + 1}) ${c.name} (${c.orientation === "upright" ? "정위" : "역위"})`).join("\n");
      aiText = `✨ 오늘의 카드\n${lines}\n\n조언: 무리하지 말고 한 걸음씩 진행해요.\n본 서비스는 엔터테인먼트용입니다.`;
    }

    // 6) 카카오 오픈빌더 스킬 응답
