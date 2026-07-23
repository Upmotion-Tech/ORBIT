import httpx
from fastapi import HTTPException, status

from app.core.config import settings

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


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
        except httpx.HTTPError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Couldn't reach the policy assistant service. Try again shortly.",
            )

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The policy assistant service returned an error.",
            )

        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


groq_service = GroqService()
