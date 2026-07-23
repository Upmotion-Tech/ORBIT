import io

from fastapi import HTTPException, status
from pypdf import PdfReader

from app.models.policy import Policy
from app.repositories.policy_repository import PolicyRepository
from app.schemas.policy import PolicyResponse
from app.services.groq_service import groq_service

# Cap per-policy context fed to the LLM so one huge PDF can't blow out the
# prompt and crowd out every other policy — generous enough for any normal
# policy document, not a real limitation in practice.
MAX_CONTEXT_CHARS_PER_POLICY = 12000


def extract_pdf_text(content: bytes) -> str:
    # Best-effort: a scanned/image-only PDF yields no extractable text, and a
    # corrupt upload shouldn't block the upload itself — the file is still
    # viewable either way, it just won't contribute to RAG answers.
    try:
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        return ""


def _to_response(policy: Policy) -> PolicyResponse:
    resp = PolicyResponse.model_validate(policy)
    # file_url is served out of the DB (see get_file below), not a static
    # path on disk — computed here rather than stored, so there's nothing to
    # go stale if the policy is ever accessed from a different deployment.
    resp.file_url = f"/api/policies/{policy.id}/file" if policy.file_data else None
    return resp


class PolicyService:
    def __init__(self, policy_repo: PolicyRepository):
        self.policy_repo = policy_repo

    async def list_policies(self) -> list[PolicyResponse]:
        policies = await self.policy_repo.find_all()
        return [_to_response(p) for p in policies]

    async def get_policy(self, policy_id: str) -> PolicyResponse:
        policy = await self.policy_repo.find_by_id(policy_id)
        if not policy:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found.")
        return _to_response(policy)

    async def get_file(self, policy_id: str) -> tuple[bytes, str]:
        policy = await self.policy_repo.find_by_id(policy_id)
        if not policy or not policy.file_data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No file attached to this policy.")
        return policy.file_data, (policy.file_name or "policy.pdf")

    async def create_policy(self, data: dict, user_id: str | None) -> PolicyResponse:
        policy = await self.policy_repo.create(data, created_by_id=user_id)
        return _to_response(policy)

    async def update_policy(self, policy_id: str, data: dict) -> PolicyResponse:
        policy = await self.policy_repo.find_by_id(policy_id)
        if not policy:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found.")
        policy = await self.policy_repo.update(policy, data)
        return _to_response(policy)

    async def delete_policy(self, policy_id: str) -> None:
        policy = await self.policy_repo.find_by_id(policy_id)
        if not policy:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found.")
        await self.policy_repo.delete(policy)

    async def attach_file(
        self, policy_id: str, file_data: bytes, file_name: str, extracted_text: str,
    ) -> PolicyResponse:
        policy = await self.policy_repo.find_by_id(policy_id)
        if not policy:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found.")
        policy = await self.policy_repo.update(
            policy, {"file_data": file_data, "file_name": file_name, "extracted_text": extracted_text}
        )
        return _to_response(policy)

    async def remove_file(self, policy_id: str) -> PolicyResponse:
        policy = await self.policy_repo.find_by_id(policy_id)
        if not policy:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found.")
        if not policy.file_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file attached to this policy.")
        policy = await self.policy_repo.update(
            policy, {"file_data": None, "file_name": None, "extracted_text": None}
        )
        return _to_response(policy)

    async def ask(self, question: str) -> str:
        # Re-reads every policy fresh from the DB on every question — no
        # static vector index to rebuild, so anything an Owner just added or
        # edited is immediately part of the answer.
        policies = await self.policy_repo.find_all()
        if not policies:
            return "There are no company policies published yet, so I don't have anything to answer from."

        sections = []
        for p in policies:
            body = (p.content or p.extracted_text or "").strip()
            if not body:
                continue
            body = body[:MAX_CONTEXT_CHARS_PER_POLICY]
            sections.append(f"### {p.title} (Category: {p.category})\n{body}")

        if not sections:
            return "The published policies don't have any readable text or PDF content yet."

        context = "\n\n".join(sections)
        return await groq_service.ask(question, context)
