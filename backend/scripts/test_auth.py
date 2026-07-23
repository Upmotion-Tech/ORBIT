import asyncio
import sys
sys.path.insert(0, '.')
from app.core.database import async_session_factory
from app.repositories.employee_repository import EmployeeRepository
from app.core.security import create_access_token, verify_password, decode_access_token

async def test():
    async with async_session_factory() as s:
        e = await EmployeeRepository(s).find_by_email('hamzashafiq@theupmotion.online')
        print(f'Found: {e is not None}')
        if e:
            print(f'Access level: {e.access_level}')
            print(f'Password OK: {await verify_password("1234", e.password_hash)}')
            tk = create_access_token({'sub': e.email, 'user_id': e.id, 'name': e.name, 'role': e.access_level})
            print(f'Token: {tk[:50]}...')
            print(f'Decoded: {decode_access_token(tk)}')

asyncio.run(test())
