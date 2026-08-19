import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"

logger = logging.getLogger("orbit.groq")


class GroqService:
    async def ask(self, question: str, context: str) -> str:
        if not settings.groq_api:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The policy assistant isn't configured yet. Ask an Owner to set up the LLM API key.",
            )

        system_prompt = (
            "You are ORBIT's internal Company Policy Assistant. Answer the "
            "employee's question using ONLY the company policy documents "
            "provided below. Be concise and specific. If the answer isn't "
            "covered by these documents, say you don't have that information "
            "in the current policies rather than guessing.\n\n"
            "COMPANY POLICIES:\n" + context
        )

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    GROQ_CHAT_URL,
                    headers={
                        "Authorization": f"Bearer {settings.groq_api}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.groq_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": question},
                        ],
                        "max_tokens": 800,
                        "temperature": 0.2,
                    },
                )
        except httpx.HTTPError as exc:
            # Log the real transport failure (timeout vs DNS vs connection
            # reset) — the caller only ever sees the generic message below,
            # and without this there is nothing anywhere to diagnose from.
            logger.error("[groq] request to %s failed: %r", GROQ_CHAT_URL, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Couldn't reach the policy assistant service. Try again shortly.",
            )

        if resp.status_code != 200:
            # This branch used to discard Groq's response body entirely, which
            # made every possible cause — revoked key, decommissioned model,
            # rate limit, bad payload — collapse into one indistinguishable
            # 502. A decommissioned model looks exactly like a bad key from
            # the outside, so "change the key and retry" was untestable.
            # Groq's own error codes are stable and specific, so they're
            # mapped to something actionable rather than re-flattened.
            body = resp.text[:500]
            code = ""
            try:
                code = (resp.json().get("error") or {}).get("code") or ""
            except ValueError:
                pass
            logger.error(
                "[groq] chat completion failed: HTTP %s code=%s model=%s body=%s",
                resp.status_code, code or "?", settings.groq_model, body,
            )

            if code == "model_not_found" or resp.status_code == 404:
                detail = (
                    f"The configured LLM model ({settings.groq_model}) no longer exists on Groq. "
                    "An Owner needs to set GROQ_MODEL to a currently available model."
                )
            elif resp.status_code in (401, 403):
                detail = "The policy assistant's API key was rejected. An Owner needs to update GROQ_API."
            elif resp.status_code == 429:
                detail = "The policy assistant is rate-limited right now. Try again in a moment."
            else:
                detail = "The policy assistant service returned an error."

            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


groq_service = GroqService()
