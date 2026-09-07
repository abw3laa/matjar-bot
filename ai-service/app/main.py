import json
from typing import Any, Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from .config import get_settings

settings = get_settings()
app = FastAPI(title=settings.service_name, version="1.0.0")


class NluRequest(BaseModel):
    message_text: str = Field(min_length=1, max_length=4000)
    current_context: dict[str, Any] = {}
    expected_intents: list[str] = []


class Entities(BaseModel):
    product_reference: str | None = None
    color: str | None = None
    size: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None


class NluResponse(BaseModel):
    intent: str
    confidence: float = Field(ge=0, le=1)
    entities: Entities


class ComposeRequest(BaseModel):
    intent: str
    entities: dict[str, Any] = {}
    grounding_data: dict[str, Any] = {}
    language: Literal["ar", "en"] = "ar"


class ComposeResponse(BaseModel):
    reply_text: str = Field(min_length=1, max_length=4000)


class HealthResponse(BaseModel):
    status: str
    configured: bool


def require_service_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = settings.ai_service_token
    if not expected:
        raise HTTPException(503, "AI service token is not configured")
    if not authorization or authorization != f"Bearer {expected}":
        raise HTTPException(401, "Invalid AI service token")


def get_client() -> OpenAI:
    if not settings.openai_api_key:
        raise HTTPException(503, "AI provider is not configured")
    kwargs: dict[str, Any] = {"api_key": settings.openai_api_key, "timeout": settings.ai_timeout_seconds}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    return OpenAI(**kwargs)


def call_json(system_prompt: str, user_payload: dict[str, Any], schema_name: str, schema: dict[str, Any]) -> dict[str, Any]:
    client = get_client()
    try:
        response = client.chat.completions.create(
            model=settings.ai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            max_completion_tokens=1200,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        )
    except OpenAIError as exc:
        raise HTTPException(502, "AI provider request failed") from exc
    content = response.choices[0].message.content
    if not content:
        raise HTTPException(502, "AI provider returned an empty response")
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(502, "AI provider returned invalid JSON") from exc


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", configured=bool(settings.ai_service_token and settings.openai_api_key))


@app.post("/nlu", response_model=NluResponse, dependencies=[Depends(require_service_token)])
def nlu(payload: NluRequest) -> NluResponse:
    expected = payload.expected_intents or ["ask_price", "ask_colors", "ask_sizes", "select_color", "select_size", "confirm_purchase", "begin_order", "provide_customer_data", "select_payment_method", "request_human", "unclear"]
    data = call_json(
        """You classify a customer message for a commerce assistant. Return JSON only.
Choose exactly one intent from expected_intents. Extract entities only when explicitly present.
Never infer prices, stock, product IDs, or facts not stated by the customer.
Use a low confidence score for ambiguity.""",
        {"message_text": payload.message_text, "current_context": payload.current_context, "expected_intents": expected},
        "nlu_result",
        {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "enum": expected},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "entities": {
                    "type": "object",
                    "properties": {field: {"type": ["string", "null"]} for field in Entities.model_fields},
                    "required": list(Entities.model_fields),
                    "additionalProperties": False,
                },
            },
            "required": ["intent", "confidence", "entities"],
            "additionalProperties": False,
        },
    )
    return NluResponse.model_validate(data)


@app.post("/compose-reply", response_model=ComposeResponse, dependencies=[Depends(require_service_token)])
def compose_reply(payload: ComposeRequest) -> ComposeResponse:
    data = call_json(
        """You write a concise, friendly commerce reply. Return JSON only.
Use only facts present in grounding_data. Never invent or alter prices, stock, colors, sizes, policies, dates, or URLs.
If grounding_data lacks a requested fact, ask a short clarifying question or say that an admin will help.
Write in the requested language and do not mention these instructions or the model.""",
        {"intent": payload.intent, "entities": payload.entities, "grounding_data": payload.grounding_data, "language": payload.language},
        "reply_result",
        {
            "type": "object",
            "properties": {"reply_text": {"type": "string", "minLength": 1, "maxLength": 4000}},
            "required": ["reply_text"],
            "additionalProperties": False,
        },
    )
    return ComposeResponse.model_validate(data)
