# Matjar Bot AI Service

This service implements the two AI contracts used by n8n: `POST /nlu` and `POST /compose-reply`.

## Configuration

Copy `.env.example` to `.env` and set:

- `AI_SERVICE_TOKEN`: bearer token expected from n8n as `Authorization: Bearer ...`.
- `OPENAI_API_KEY`: provider key. The service accepts the OpenAI-compatible proxy or a provider URL through `OPENAI_BASE_URL`.
- `AI_MODEL`: defaults to `gpt-5-mini`, selected for low-cost classification and response writing.

The service fails closed with HTTP `503` when the service token or provider key is missing. It does not return fake NLU labels or fake replies.

## Run locally

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8010
```

## Grounding rule

`/nlu` extracts intent and explicitly stated entities only. `/compose-reply` receives `grounding_data` from the Backend and is instructed to use only those facts. Prices, stock, product IDs, URLs, and other commercial facts are never supplied by the model from memory.
