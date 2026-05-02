# 말하기 시험 통합 평가 시스템 - Netlify 배포 오류 수정판

## 중요
Netlify 환경변수에는 `OPENAI_API_KEY`만 필요합니다.

삭제해도 되는 환경변수:
- SCORE_MODEL
- TRANSCRIBE_MODEL

## 수정 이유
Netlify가 `SCORE_MODEL`, `TRANSCRIBE_MODEL` 값을 node_modules 안에서 발견해 비밀값 노출로 오인하는 문제가 있어, 모델명 환경변수 사용을 제거했습니다.

## 배포 방법
1. ZIP 압축을 풉니다.
2. GitHub 저장소에 압축을 푼 파일 전체를 업로드합니다.
3. Netlify 환경변수에서 `OPENAI_API_KEY`만 설정합니다.
4. `SCORE_MODEL`, `TRANSCRIBE_MODEL`이 있다면 삭제합니다.
5. Deploys → Trigger deploy → Deploy site를 실행합니다.
