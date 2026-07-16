from typing import Optional, Any
from pydantic import BaseModel


class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 50


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int


class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    errors: Optional[dict[str, Any]] = None


class WarningResponse(BaseModel):
    success: bool = True
    warning: Optional[str] = None
    data: Optional[Any] = None
