import OpenAI from "openai";
import { toFile } from "openai/uploads";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function areaScoreFromRaw(raw) {
  const n = Number(raw || 0);
  if (n >= 2.5) return 3;
  if (n >= 1.5) return 2;
  if (n >= 0.5) return 1;
  return 0;
}

function deliveryScoreFromRaw(raw) {
  const n = Number(raw || 0);
  if (n >= 1.5) return 2;
  if (n >= 0.5) return 1;
  return 0;
}

function gradeFromTotal(total) {
  if (total >= 7) return "7급";
  if (total === 6) return "6급";
  if (total === 5) return "5급";
  return "4급";
}

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
너는 한국어 말하기 평가 보조 채점자다. 아래 전사와 평가 기준을 바탕으로 점수를 추천한다.
최종 판정자는 교사이므로, 너는 점수와 근거를 일관되게 제안해야 한다.

[문항]
최근 과학 기술의 발달로 인해 집에서 온라인으로 수업을 듣는 '비대면 교육'이 보편화되고 있습니다.
비대면 교육은 장점도 많지만 단점도 적지 않습니다.
1. 비대면 교육의 장단점을 대면 교육과 비교하여 설명하십시오.
2. 개인적으로 어떤 방식을 선호하는지 말해 보십시오.

[점수 체계]
과제 수행: 상위요소 3개, 각 1점/0.5점/0점.
표현: 상위요소 3개, 각 1점/0.5점/0점.
전달: 상위요소 2개, 각 1점/0.5점/0점.

[환산]
과제 수행/표현: 원점수 2.5~3점=3점, 1.5~2점=2점, 0.5~1점=1점, 0점=0점.
전달: 원점수 1.5~2점=2점, 0.5~1점=1점, 0점=0점.
총점 7~8점=7급, 6점=6급, 5점=5급, 0~4점=4급.

[과제 수행]
상위요소 1. 대면 교육과 비교하여 비대면 교육의 장점 설명하기
- 1점: 특정 관점에서 비대면 교육 장점을 제시하고, '대면 교육'과 '비대면 교육' 또는 이에 준하는 명시적 표현을 언급하며, 비교 표현으로 차이·대조를 드러냄.
- 0.5점: 위 세부요소 중 한 가지만 충족함.
- 0점: 모두 불충족.

상위요소 2. 대면 교육과 비교하여 비대면 교육의 단점 설명하기
- 1점: 특정 관점에서 비대면 교육 단점을 제시하고, '대면 교육'과 '비대면 교육' 또는 이에 준하는 명시적 표현을 언급하며, 비교 표현으로 차이·대조를 드러냄.
- 0.5점: 위 세부요소 중 한 가지만 충족함.
- 0점: 모두 불충족.

상위요소 3. 선호 교육 방법에 대한 의견 제시하기
- 1점: 대면 또는 비대면 중 하나를 명시적으로 선택하고, 인과 표현으로 이유를 논리적으로 연결함. 앞서 제시한 내용을 지시한 경우도 인정함.
- 0.5점: 선택 또는 이유 중 한 가지만 충족함.
- 0점: 모두 불충족.

[표현]
최소 수행 기준: 과제 수행을 1개만 시도했거나 3문장 이하이면 표현은 0점으로 판단한다.
상위요소 1. 등급에 맞는 어휘 및 문법 사용하기
- 1점: 5급 어휘와 문법을 각 2개 이상, 6급 어휘와 문법을 각 2개 이상 사용함.
- 0.5점: 5급 또는 6급 기준 중 한 가지만 충족함.
- 0점: 모두 불충족.

상위요소 2. 어휘 및 문법을 오류 없이 사용하기
- 1점: 서로 다른 유형의 오류가 1~2개이고 의사소통에 방해가 되지 않음.
- 0.5점: 오류가 3~4개이거나 의사소통 방해 오류가 1개 이상임.
- 0점: 오류가 5개 이상이거나 의사소통 방해 오류가 2개 이상임.

상위요소 3. 주요 기능을 위한 담화 표현 사용하기
- 1점: 비교 표현과 종합·결론 표현을 모두 사용함.
- 0.5점: 둘 중 하나만 사용함.
- 0점: 모두 사용하지 않음.

[전달]
최소 수행 기준: 과제 수행을 1개만 시도했거나 3문장 이하이면 전달은 0점으로 판단한다.
상위요소 1. 발음 자연성
- 1점: 전체 발화의 80% 이상이 자연스럽고 대부분 문장이 끊김 없이 이해 가능함.
- 0.5점: 전체 발화의 40% 이상 80% 미만이 자연스럽고, 일부 부자연스러움이 있으나 전체 내용 이해 가능함.
- 0점: 40% 미만이 자연스럽고 이해에 지속적으로 방해됨.

상위요소 2. 전략적 요소 활용
- 1점: 속도, 크기, 억양, 더듬거림, 반복, 휴지 등이 80% 이상 자연스럽고 전략적으로 활용됨.
- 0.5점: 40% 이상 80% 미만이 자연스럽고 전략적이며 일부 부자연스러움이 있으나 전체 이해 가능함.
- 0점: 40% 미만이 자연스럽고 이해에 지속적으로 방해됨.

[전사]
${transcript}

[출력 규칙]
각 상위요소 점수는 반드시 1, 0.5, 0 중 하나로 반환한다. 모든 상위요소의 Score와 Reason 필드를 빠짐없이 채운다.
O, △, X 문자는 절대 사용하지 않는다.
반드시 JSON만 반환한다.

{
  "taskElement1Score": 0,
  "taskElement1Reason": "근거",
  "taskElement2Score": 0,
  "taskElement2Reason": "근거",
  "taskElement3Score": 0,
  "taskElement3Reason": "근거",
  "expressionElement1Score": 0,
  "expressionElement1Reason": "근거",
  "expressionElement2Score": 0,
  "expressionElement2Reason": "근거",
  "expressionElement3Score": 0,
  "expressionElement3Reason": "근거",
  "deliveryElement1Score": 0,
  "deliveryElement1Reason": "근거",
  "deliveryElement2Score": 0,
  "deliveryElement2Reason": "근거",
  "summary": "총평",
  "taskEvidence": "근거",
  "languageEvidence": "근거",
  "deliveryEvidence": "근거",
  "cautions": "검토 사항"
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

    const te1 = Number(result.taskElement1Score ?? 0);
    const te2 = Number(result.taskElement2Score ?? 0);
    const te3 = Number(result.taskElement3Score ?? 0);
    const ee1 = Number(result.expressionElement1Score ?? 0);
    const ee2 = Number(result.expressionElement2Score ?? 0);
    const ee3 = Number(result.expressionElement3Score ?? 0);
    const de1 = Number(result.deliveryElement1Score ?? 0);
    const de2 = Number(result.deliveryElement2Score ?? 0);

    const taskRaw = te1 + te2 + te3;
    const exprRaw = ee1 + ee2 + ee3;
    const delivRaw = de1 + de2;

    const task = areaScoreFromRaw(taskRaw);
    const expr = areaScoreFromRaw(exprRaw);
    const deliv = deliveryScoreFromRaw(delivRaw);
    const total = task + expr + deliv;

    Object.assign(result, {
      taskRawScore: taskRaw,
      taskScore: task,
      expressionRawScore: exprRaw,
      expressionScore: expr,
      languageScore: expr,
      deliveryRawScore: delivRaw,
      deliveryScore: deliv,
      total,
      grade: gradeFromTotal(total),
      transcript
    });

    return {
      statusCode: 200,
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ error: error.message || String(error) })
    };
  }
}
