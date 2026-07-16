import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base
from app.routers import leads, settings as settings_router, preferences

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "errors": {"detail": str(exc)} if settings.debug else None,
        },
    )


app.mount("/api/storage", StaticFiles(directory=settings.storage_path), name="storage")
app.include_router(leads.router)
app.include_router(settings_router.router)
app.include_router(preferences.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.app_name, "version": settings.app_version}


@app.get("/")
async def serve_frontend():
    index_path = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(index_path)
