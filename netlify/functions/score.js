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
너는 한국어 말하기 평가 보조 채점자다. 아래 전사와 평가 기준을 바탕으로 교사 검토용 점수를 추천한다.
최종 판정자는 교사이므로, 너는 점수와 근거를 일관되게 제안해야 한다.

[문항 정보]
측정 목표 등급: 고급(5~6급)
기능: 설명하기, 의견 말하기
문항 구조:
- 문장1: 주제 도입 및 상황 설명
- 문장2: 내용의 범위 및 방향 제시
- 문장3: 과제 제시

[지시문]
다음 질문에 대답하세요. 1분 30초 동안 생각하고, 2분 동안 말하세요.

[과제]
최근 과학 기술의 발달로 인해 집에서 온라인으로 수업을 듣는 '비대면 교육'이 보편화되고 있습니다.
비대면 교육은 장점도 많지만 단점도 적지 않습니다.
1. 비대면 교육의 장단점을 대면 교육과 비교하여 설명하십시오.
2. 개인적으로 어떤 방식을 선호하는지 말해 보십시오.

[채점 영역과 점수]
과제 수행: 0~3점
표현: 0~3점
전달: 0~2점
총점: 과제 수행 + 표현 + 전달
등급 산출:
- 7~8점 = 7급
- 6점 = 6급
- 5점 = 5급
- 0~4점 = 4급

==================================================
[채점 기준 - 과제 수행]
상위요소 1: 대면 교육과 비교하여 비대면 교육의 장점 설명하기
- 세부요소 1) 특정 관점(시간 및 공간의 제약 극복, 편의성 등)에서 비대면 교육의 장점을 제시했는가
- 세부요소 2) 대면 교육과 비대면 교육을 직접 언급하고 '~와/과 달리, ~보다, 반면에, ~에 비해' 등 비교 표현을 1회 이상 사용하여 차이 또는 대조를 명시적으로 드러냈는가
판정: O=세부요소 1과 2 모두 충족, △=둘 중 하나만 충족, X=수행 없음

상위요소 2: 대면 교육과 비교하여 비대면 교육의 단점 설명하기
- 세부요소 1) 특정 관점(상호작용의 한계, 기자재 준비 등)에서 비대면 교육의 단점을 제시했는가
- 세부요소 2) 대면 교육과 비대면 교육을 직접 언급하고 '~와/과 달리, ~보다, 반면에, ~에 비해' 등 비교 표현을 1회 이상 사용하여 차이 또는 대조를 명시적으로 드러냈는가
판정: O=세부요소 1과 2 모두 충족, △=둘 중 하나만 충족, X=수행 없음

상위요소 3: 자신이 선호하는 교육 방법에 대한 의견 제시하기
- 세부요소 1) 대면 교육 또는 비대면 교육 중 하나를 명시적으로 선택하고 '나는 ~을 선호한다, ~이/가 더 좋다, ~을/를 선택하겠다' 등 선호 표현을 사용하여 입장을 분명하게 드러냈는가
- 세부요소 2) 선호의 이유를 설명하면서 '왜냐하면, ~기 때문에, 그 이유는, 따라서' 등 인과 표현을 사용하여 논리적으로 연결했는가
  단, 앞서 제시한 내용을 지시한 경우도 인정한다.
판정: O=세부요소 1과 2 모두 충족, △=둘 중 하나만 충족, X=수행 없음

과제 수행 점수:
- 3점: OOO, OO△
- 2점: O△△, O△X, △△△
- 1점: OXX, △△X, △XX
- 0점: XXX

==================================================
[채점 기준 - 표현]
상위요소 1: 등급에 맞는 어휘 및 문법 사용하기
- 세부요소 1) 5급의 어휘와 문법을 사용했는가(각 2개 이상)
- 세부요소 2) 6급의 어휘와 문법을 사용했는가(각 2개 이상)
판정: O=세부요소 1과 2 모두 충족, △=둘 중 하나만 충족, X=둘 모두 불충족

상위요소 2: 어휘 및 문법을 오류 없이 사용하기
오류 유형: 음운 오류, 조사 오류, 시제 오류, 어휘 선택 오류, 문장 구조 오류, 연결 표현 오류 등
판정:
- O: 서로 다른 유형의 오류 1~2개
- △: 서로 다른 유형의 오류 3~4개
- X: 서로 다른 유형의 오류 5개 이상

상위요소 3: 담화의 연결성, 응집성을 위한 표현 사용하기
- 세부요소 1) '비교하여 설명하기' 위해 '~와/과 달리, ~보다, 반면에, ~에 비해, 그러나' 등 비교 표현을 사용했는가
- 세부요소 2) '내용을 종합하여 제시하기' 위해 '따라서, 그래서, 그러므로, 결국, 이와 같이, 종합하면, 이런 점에서, 이런 이유로' 등 종합·결론 표현을 1회 이상 사용했는가
판정: O=세부요소 1과 2 모두 충족, △=둘 중 하나만 충족, X=둘 모두 불충족

표현 점수:
- 3점: OOO, OO△
- 2점: O△△, O△X, △△△
- 1점: OXX, △△X, △XX
- 0점: XXX

==================================================
[채점 기준 - 전달]
상위요소 1: 해당 등급의 비모국어 화자의 수준에서 자연스럽게 발음하기
비모국어 화자임을 고려했을 때 발음이 자연스럽다고 인식되는가
판정:
- O: 전체 발화의 80% 이상이 자연스럽다고 인식됨, 대부분 문장이 끊김 없이 이해 가능함
- △: 전체 발화의 40% 이상, 80% 미만이 자연스럽다고 인식됨, 일부 끊김이나 부자연스러움이 있으나 전체적인 내용은 이해 가능함
- X: 전체 발화의 40% 미만이 자연스럽다고 인식됨, 이해하는 데 지속적으로 방해가 됨

상위요소 2: 해당 등급의 비모국어 화자의 수준에서 전략적인 요소 활용하기
비모국어 화자임을 고려했을 때 느린 속도, 소리의 크기 및 높낮이, 더듬거림, 주저함, 반복 말하기, 휴지 등을 지나치거나 부자연스럽게 사용하지 않고 전달을 위해 전략적으로 활용하는가
판정:
- O: 전체 발화의 80% 이상이 자연스럽고 전략적이라고 인식됨, 대부분 문장이 끊김 없이 이어짐
- △: 전체 발화의 40% 이상, 80% 미만이 자연스럽고 전략적이라고 인식됨, 일부 끊김이나 부자연스러움이 있으나 전체적인 내용은 이해 가능함
- X: 전체 발화의 40% 미만이 자연스럽고 전략적이라고 인식됨, 이해하는 데 지속적으로 방해가 됨

전달 점수:
- 2점: OO, O△
- 1점: OX, △△, △X
- 0점: XX

[전사]
${transcript}

[출력 형식]
반드시 JSON만 반환한다. 점수는 정수로 반환한다.
{
  "taskScore": 0,
  "expressionScore": 0,
  "deliveryScore": 0,
  "total": 0,
  "grade": "4급",
  "taskElement1": "O/△/X 및 근거",
  "taskElement2": "O/△/X 및 근거",
  "taskElement3": "O/△/X 및 근거",
  "expressionElement1": "O/△/X 및 근거",
  "expressionElement2": "O/△/X 및 근거",
  "expressionElement3": "O/△/X 및 근거",
  "deliveryElement1": "O/△/X 및 근거",
  "deliveryElement2": "O/△/X 및 근거",
  "summary": "총평",
  "taskEvidence": "과제 수행 점수 근거",
  "languageEvidence": "표현 점수 근거",
  "deliveryEvidence": "전달 점수 근거",
  "cautions": "교사가 검토해야 할 사항"
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

    const task = Number(result.taskScore ?? 0);
    const expr = Number(result.expressionScore ?? result.languageScore ?? 0);
    const deliv = Number(result.deliveryScore ?? 0);
    const total = task + expr + deliv;

    result.taskScore = task;
    result.expressionScore = expr;
    result.languageScore = expr;
    result.deliveryScore = deliv;
    result.total = total;
    result.grade = total >= 7 ? "7급" : total === 6 ? "6급" : total === 5 ? "5급" : "4급";
    result.transcript = transcript;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || String(error) })
    };
  }
}
