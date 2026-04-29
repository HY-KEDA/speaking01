import OpenAI from "openai";
import { toFile } from "openai/uploads";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: "POST only" }) };
    }
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: "OPENAI_API_KEY가 설정되어 있지 않습니다." }) };
    }
    const body = JSON.parse(event.body || "{}");
    if (!body.audioBase64) {
      return { statusCode: 400, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: "audioBase64가 없습니다." }) };
    }
    const audioBuffer = Buffer.from(body.audioBase64, "base64");
    const mimeType = body.mimeType || "audio/webm";

    function extensionFromMime(type) {
      if (!type) return "webm";
      if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
      if (type.includes("wav")) return "wav";
      if (type.includes("mp4") || type.includes("m4a")) return "m4a";
      if (type.includes("ogg")) return "ogg";
      if (type.includes("webm")) return "webm";
      return "webm";
    }

    const ext = extensionFromMime(mimeType);
    const audioFile = await toFile(audioBuffer, `speaking_audio.${ext}`, { type: mimeType });

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: process.env.TRANSCRIBE_MODEL || "gpt-4o-transcribe",
      language: "ko"
    });
    const transcript = transcription.text || "";

    const prompt = `
너는 한국어 말하기 평가 보조 채점자다. 아래 발화 전사를 바탕으로 교사 검토용 점수를 추천하라.

시험 문항:
최근 과학 기술의 발달로 인해 집에서 온라인으로 수업을 듣는 '비대면 교육'이 보편화되고 있습니다. 비대면 교육은 장점도 많지만 단점도 적지 않습니다.
1. 비대면 교육의 장단점을 대면 교육과 비교하여 설명하십시오.
2. 개인적으로 어떤 방식을 선호하는지 말해 보십시오.

평가 요소:
1) 과제 수행: 1~3점
- 3점: 비대면 교육과 대면 교육을 비교하며 장단점을 설명하고, 선호 방식과 이유를 제시함.
- 2점: 비교나 장단점, 선호와 이유 중 일부만 충족하거나 근거가 충분하지 않음.
- 1점: 과제와 관련은 있으나 비교·장단점·선호·이유가 매우 부족함.

2) 언어: 1~3점
- 과제 수행 점수를 기준으로 하되, 5~6급 수준의 어휘·문법이나 비교·대조, 원인·이유, 선호·의견, 장단점 설명, 추상적 표현, 복문 구성, 연결 표현을 2개 이상 자연스럽게 사용했는지 검토한다.
- 언어 오류가 의미 전달을 크게 방해하면 감점한다.

3) 전달: 1~2점
- 2점: 발음, 속도, 유창성이 대체로 적절하고 머뭇거림·반복·휴지가 의사소통을 크게 방해하지 않으며, 연결 표현을 사용해 내용이 이어짐.
- 1점: 발음·속도·유창성 문제, 과도한 머뭇거림·반복·휴지, 연결성 부족으로 이해에 방해가 있음.
전사만으로 전달을 완전히 판단할 수 없으므로 불확실하면 주의 사항을 남겨라.

등급 산출:
과제 수행(1~3) + 언어(1~3) + 전달(1~2)의 총점.
7~8점 = 7급, 6점 = 6급, 5점 = 5급, 3~4점 = 4급.

발화 전사:
${transcript}

반드시 JSON만 반환:
{
  "taskScore": 1,
  "languageScore": 1,
  "deliveryScore": 1,
  "total": 3,
  "grade": "4급",
  "summary": "한두 문장 총평",
  "taskEvidence": "과제 수행 근거",
  "languageEvidence": "언어 점수 근거와 5~6급 수준 표현 예",
  "deliveryEvidence": "전달 점수 근거",
  "cautions": "교사 검토 필요 사항"
}
`;

    const response = await client.responses.create({
      model: process.env.SCORE_MODEL || "gpt-4o-mini",
      input: prompt,
      text: { format: { type: "json_object" } }
    });

    let result;
    try { result = JSON.parse(response.output_text); }
    catch { result = { summary: response.output_text }; }
    result.transcript = transcript;

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: error.message || String(error) }) };
  }
}
