import os

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_owner_department_user
from app.repositories.policy_repository import PolicyRepository
from app.services.policy_service import PolicyService, extract_pdf_text
from app.schemas.policy import (
    PolicyCreate,
    PolicyUpdate,
    PolicyResponse,
    PolicyAskRequest,
    PolicyAskResponse,
)

router = APIRouter(prefix="/api/policies", tags=["Policies"])

MAX_FILE_SIZE = 15 * 1024 * 1024


def get_policy_service(db: AsyncSession = Depends(get_db)) -> PolicyService:
    return PolicyService(policy_repo=PolicyRepository(db))


@router.get("", response_model=list[PolicyResponse])
async def list_policies(
    current_user: dict = Depends(get_current_user),
    service: PolicyService = Depends(get_policy_service),
):
    return await service.list_policies()


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(
    policy_id: str,
    current_user: dict = Depends(get_current_user),
    service: PolicyService = Depends(get_policy_service),
):
    return await service.get_policy(policy_id)


@router.post("", response_model=PolicyResponse, status_code=status.HTTP_201_CREATED)
async def create_policy(
    body: PolicyCreate,
    current_user: dict = Depends(get_owner_department_user),
    service: PolicyService = Depends(get_policy_service),
):
    return await service.create_policy(body.model_dump(), user_id=current_user.get("user_id"))


@router.put("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: str,
    body: PolicyUpdate,
    current_user: dict = Depends(get_owner_department_user),
    service: PolicyService = Depends(get_policy_service),
):
    return await service.update_policy(policy_id, body.model_dump(exclude_none=True))


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_policy(
    policy_id: str,
    current_user: dict = Depends(get_owner_department_user),
    service: PolicyService = Depends(get_policy_service),
):
    await service.delete_policy(policy_id)


@router.post("/{policy_id}/file", response_model=PolicyResponse)
async def upload_policy_file(
    policy_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_owner_department_user),
    service: PolicyService = Depends(get_policy_service),
):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds maximum limit of 15MB.",
        )

    ext = os.path.splitext(file.filename or ".bin")[1].lower()
    if ext != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are supported for policy documents.",
        )

    extracted_text = extract_pdf_text(content)
    return await service.attach_file(policy_id, content, file.filename or "policy.pdf", extracted_text)


@router.get("/{policy_id}/file")
async def get_policy_file(
    policy_id: str,
    current_user: dict = Depends(get_current_user),
    service: PolicyService = Depends(get_policy_service),
):
    file_data, file_name = await service.get_file(policy_id)
    return Response(
        content=file_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


@router.delete("/{policy_id}/file", response_model=PolicyResponse)
async def remove_policy_file(
    policy_id: str,
    current_user: dict = Depends(get_owner_department_user),
    service: PolicyService = Depends(get_policy_service),
):
    return await service.remove_file(policy_id)


@router.post("/ask", response_model=PolicyAskResponse)
async def ask_policy_assistant(
    body: PolicyAskRequest,
    current_user: dict = Depends(get_current_user),
    service: PolicyService = Depends(get_policy_service),
):
    answer = await service.ask(body.question)
    return PolicyAskResponse(answer=answer)
