import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function buildPrompt({ topic, picks }) {
  const list = picks.map((c, i) => `${i+1}) ${c.name} (${c.orientation === "upright" ? "정위" : "역위"})`).join("\n");
  return `
너는 엔터테인먼트용 타로 리더야.
- 해석은 따뜻하고 구체적으로.
- 과장/단정 금지.
- 조언은 2~3문장.
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
    const filePath = path.resolve("./", "cards.json");
    const cards = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const body = req.body || {};
    const params = body.action?.params || {};
    const count = Number(params.count || 1);
    const topic = (params.topic || "general");

    const picks = [];
    for (let i = 0; i < count; i++) {
      const c = cards[Math.floor(Math.random() * cards.length)];
      const orientation = Math.random() < 0.45 ? "reversed" : "upright";
      picks.push({ name: c.name, orientation });
    }

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
          model: "gpt-4o-mini",
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

    if (!aiText) {
      const lines = picks.map((c, i) => `${i + 1}) ${c.name} (${c.orientation === "upright" ? "정위" : "역위"})`).join("\n");
      aiText = `✨ 오늘의 카드\n${lines}\n\n조언: 지금은 차분하게 기다릴 때예요.\n본 서비스는 엔터테인먼트용입니다.`;
    }

    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: aiText } }],
        quickReplies: [
          { label: "💞 연애 리딩", action: "message", messageText: "연애 타로" },
          { label: "💰 금전 리딩", action: "message", messageText: "금전 타로" },
          { label: "🌌 종합 리딩", action: "message", messageText: "종합 타로" }
        ]
      }
    });
  } catch {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "서버 오류입니다. 잠시 후 다시 시도해주세요 🙏" }] } }
    });
  }
}
