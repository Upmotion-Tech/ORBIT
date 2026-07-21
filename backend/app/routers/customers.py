from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_persona_roles
from app.repositories.customer_repository import CustomerRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.customer_service import CustomerService
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse

router = APIRouter(prefix="/api/customers", tags=["Customers"])


def get_customer_service(db: AsyncSession = Depends(get_db)) -> CustomerService:
    return CustomerService(CustomerRepository(db), AuditLogRepository(db))


@router.get("", response_model=list[CustomerResponse])
async def list_customers(
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 200,
    current_user: dict = Depends(get_current_user),
    service: CustomerService = Depends(get_customer_service),
):
    return await service.list_customers(search=search, page=page, page_size=page_size)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
    service: CustomerService = Depends(get_customer_service),
):
    customer = await service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
    return customer


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: CustomerService = Depends(get_customer_service),
):
    return await service.create_customer(
        body.model_dump(),
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
    )


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: CustomerService = Depends(get_customer_service),
):
    return await service.update_customer(
        customer_id,
        body.model_dump(exclude_none=True),
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
    )


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: CustomerService = Depends(get_customer_service),
):
    deleted = await service.delete_customer(
        customer_id,
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
