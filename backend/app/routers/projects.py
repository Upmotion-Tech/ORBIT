import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_role
from app.repositories.project_repository import ProjectRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.notification_repository import NotificationRepository
from app.services.project_service import ProjectService
from app.services.storage_service import storage_service
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.comment import CommentCreate, CommentResponse

router = APIRouter(prefix="/api/projects", tags=["Projects"])


def get_project_service(db: AsyncSession = Depends(get_db)) -> ProjectService:
    return ProjectService(
        ProjectRepository(db),
        LeadRepository(db),
        NotificationRepository(db),
    )


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    search: Optional[str] = None,
    client: Optional[str] = None,
    status: Optional[str] = None,
    team_member: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    return await service.list_projects(
        search=search,
        client=client,
        status_filter=status,
        team_member=team_member,
        date_from=date_from,
        date_to=date_to,
        persona=persona,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    project = await service.get_project(project_id, persona)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )
    return project


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    # Map Jordan Blake for owner role, or persona role
    user_name = "Jordan Blake" if persona in ("owner", "finance") else persona
    return await service.create_project(data.model_dump(), user=user_name, persona=persona)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    user_name = "Jordan Blake" if persona in ("owner", "finance") else persona
    return await service.update_project(
        project_id,
        data.model_dump(exclude_unset=True),
        user=user_name,
        persona=persona,
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    success = await service.delete_project(project_id, persona=persona)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )
    return {"success": True, "message": "Project deleted successfully."}


# --- Attachments ---

@router.post("/{project_id}/attachments")
async def upload_attachment(
    project_id: str,
    file: UploadFile = File(...),
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    project = await service.project_repo.find_by_id(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    # 1. Enforce size limit: 10MB
    MAX_SIZE = 10 * 1024 * 1024
    content = await file.read()
    file_size = len(content)
    await file.seek(0)
    
    if file_size > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds maximum limit of 10MB.",
        )

    # 2. Check extensions
    ext = os.path.splitext(file.filename or ".bin")[1].lower()
    if ext not in storage_service.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Allowed file types: {', '.join(storage_service.ALLOWED_EXTENSIONS)}",
        )

    # 3. Check for replacement permissions
    existing = await service.project_repo.find_attachment_by_id_and_filename(project_id, file.filename)
    if existing and persona == "dev":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev members cannot replace existing attachments.",
        )

    # If it is a replacement, remove the old file
    if existing:
        await storage_service.delete(existing.filename)
        await service.project_repo.delete_attachment(existing)

    # Save physical file
    filename = await storage_service.save(file, prefix=f"proj_{project_id}_")
    url = storage_service.get_url(filename)
    
    user_name = "Jordan Blake" if persona in ("owner", "finance") else "Kofi Mensah"
    attachment = await service.project_repo.add_attachment(
        project_id=project_id,
        filename=file.filename,
        url=url,
        size_bytes=file_size,
        uploaded_by=user_name,
    )

    # Generate Notification
    if service.notification_repo:
        # Notify assigned team members
        for member in project.team:
            target_user = "dev" if member == "Kofi Mensah" else "all"
            await service.notification_repo.create(
                user_id=target_user,
                notif_type="Attachment Uploaded",
                title=f"New attachment on project: {project.name}",
                message=f"'{file.filename}' has been uploaded by {user_name}.",
            )

    return {
        "success": True,
        "message": "Attachment uploaded successfully.",
        "attachment": {
            "name": attachment.filename,
            "url": attachment.url,
            "size_bytes": attachment.size_bytes,
            "uploaded_by": attachment.uploaded_by,
        }
    }


@router.delete("/{project_id}/attachments/{filename}")
async def delete_attachment(
    project_id: str,
    filename: str,
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    if persona == "dev":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev members cannot delete attachments.",
        )

    attachment = await service.project_repo.find_attachment_by_id_and_filename(project_id, filename)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found on this project.",
        )

    await storage_service.delete(attachment.filename)
    await service.project_repo.delete_attachment(attachment)
    return {"success": True, "message": "Attachment deleted successfully."}


@router.get("/{project_id}/attachments")
async def get_attachments(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
):
    attachments = await service.project_repo.get_attachments(project_id)
    return [{
        "name": a.filename,
        "url": a.url,
        "size_bytes": a.size_bytes,
        "uploaded_by": a.uploaded_by,
    } for a in attachments]


# --- Comments ---

@router.post("/{project_id}/comments", response_model=CommentResponse)
async def add_comment(
    project_id: str,
    data: CommentCreate,
    persona: str = Depends(get_persona_role),
    service: ProjectService = Depends(get_project_service),
):
    project = await service.project_repo.find_by_id(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    # Check dev project visibility
    if persona == "dev" and "Kofi Mensah" not in project.team:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot comment on projects you are not assigned to.",
        )

    user_name = "Jordan Blake" if persona in ("owner", "finance") else "Kofi Mensah"
    comment = await service.project_repo.add_comment(
        project_id=project_id,
        task_id=data.task_id,
        parent_id=data.parent_id,
        author=user_name,
        text=data.text,
    )

    # Generate Notification for Comments
    if service.notification_repo:
        # Notify team members
        for member in project.team:
            if member == user_name:
                continue
            target_user = "dev" if member == "Kofi Mensah" else "all"
            await service.notification_repo.create(
                user_id=target_user,
                notif_type="Comment Added",
                title=f"New comment on project: {project.name}",
                message=f"{user_name} said: '{data.text[:50]}...'",
            )

    return CommentResponse.model_validate(comment)


@router.get("/{project_id}/comments", response_model=list[CommentResponse])
async def get_comments(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
):
    comments = await service.project_repo.get_comments(project_id)
    return [CommentResponse.model_validate(c) for c in comments]
