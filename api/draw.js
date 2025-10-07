import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 사용자가 한국어로 입력해도 주제 매핑되도록 보정
function resolveTopic(req) {
  // 기본값
  let topic = "general";

  // Kakao 오픈빌더 body (POST) 기준
  const body = req.body || {};
  const params = body.action?.params || {};
  const utter = body.userRequest?.utterance?.trim() || "";

  // 1) 블록에서 파라미터 넘겨준 게 있으면 우선
  if (params.topic) topic = String(params.topic).toLowerCase();

  // 2) 사용자가 보낸 문장에서 키워드 매핑
  //    필요시 자유롭게 추가 가능
  if (/연애|사랑|love/i.test(utter)) topic = "love";
  else if (/금전|재물|돈|money|재정/i.test(utter)) topic = "money";
  else if (/취업|직장|일|job|career/i.test(utter)) topic = "career";
  else if (/미래|future/i.test(utter)) topic = "future";
  else if (/사업|business/i.test(utter)) topic = "business";
  else if (/종합|general|전체/i.test(utter)) topic = "general";

  return topic;
}

function buildPrompt({ topic, picks }) {
  const list = picks
    .map(
      (c, i) =>
        `${i + 1}) ${c.name} (${
          c.orientation === "upright" ? "정위" : "역위"
        })`
    )
    .join("\n");

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
    // 0) GET 요청 들어오면 헬스체크/간단 테스트로 응답
    if (req.method === "GET") {
      return res.status(200).json({
        version: "2.0",
        template: {
          outputs: [
            {
              simpleText: {
                text:
                  "타로 스킬이 정상 동작 중입니다. 블록에서 이 스킬을 연결해 테스트해 주세요.",
              },
            },
          ],
        },
      });
    }

    // 1) 카드 로드
    const filePath = path.join(process.cwd(), "api", "cards.json");
    const cards = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // 2) 파라미터/주제 추출
    const body = req.body || {};
    const params = body.action?.params || {};
    const count = Number(params.count || 1); // 1/3/7 등
    const topic = resolveTopic(req); // utterance 기반 매핑 포함

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
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // 접근 가능한 모델로 변경 가능: gpt-4o-mini, gpt-4o, gpt-3.5-turbo 등
          model: "gpt-3.5-turbo",
          temperature: 0.8,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful Korean tarot reader for entertainment.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      const data = await resp.json();
      aiText = data?.choices?.[0]?.message?.content?.trim();
    } catch {
      aiText = null;
    }

    // 5) 실패 시 기본 응답
    if (!aiText) {
      const lines = picks
        .map(
          (c, i) =>
            `${i + 1}) ${c.name} (${
              c.orientation === "upright" ? "정위" : "역위"
            })`
        )
        .join("\n");
      aiText =
        `✨ 오늘의 카드\n${lines}\n\n` +
        `조언: 무리하지 말고 한 걸음씩 진행해요.\n` +
        `본 서비스는 엔터테인먼트용입니다.`;
    }

    // 6) 카카오 오픈빌더 스킬 응답 (루트에 version/template만!)
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: aiText } }],
        quickReplies: [
          { label: "💞 연애 리딩", action: "message", messageText: "연애 타로" },
          { label: "💰 금전 리딩", action: "message", messageText: "금전 타로" },
          { label: "🌌 종합 리딩", action: "message", messageText: "종합 타로" },
        ],
      },
    });
  } catch (e) {
    // 전체 try 바깥에서 터지면 여기로 옴
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: "서버 오류입니다. 잠시 후 다시 시도해주세요 🙏",
            },
          },
        ],
      },
    });
  }
}
