from fastapi import APIRouter

router = APIRouter(prefix="/scenes", tags=["scenes"])


@router.get("")
def list_scenes() -> dict:
    """Stub until scene persist is implemented."""
    return {"scenes": []}
