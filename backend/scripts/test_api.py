import urllib.request, json, sys

BASE = 'http://localhost:8000'

def req(method, path, data=None, headers=None):
    h = headers or {}
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(f'{BASE}{path}', data=body, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(r)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

# Test login
status, data = req('POST', '/api/auth/login', {'email': 'hamzashafiq@theupmotion.online', 'password': '1234'})
print(f'Login: {status}')
token = data['access_token']
print(f'Role: {data["user"]["access_level"]}')

# Test with auth
status, emps = req('GET', '/api/employees', headers={'Authorization': f'Bearer {token}'})
print(f'Employees (auth): {status} - {len(emps)} employees')

# Test without auth
status, err = req('GET', '/api/employees')
print(f'Employees (no auth): {status} - {err["detail"]}')

# Test with employee role
status, data2 = req('POST', '/api/auth/login', {'email': 'tom@theupmotion.online', 'password': 'password123'})
token2 = data2['access_token']
print(f'Tom login: {status} - role={data2["user"]["access_level"]}')
status, emps2 = req('GET', '/api/employees', headers={'Authorization': f'Bearer {token2}'})
print(f'Tom employees: {status}')
if status == 200:
    print(f'  Got {len(emps2)} employees (should be 403)')
else:
    print(f'  Error: {emps2["detail"]}')

# Test leads (non-HR endpoint, should work for owner)
status, data3 = req('POST', '/api/auth/login', {'email': 'jordan@theupmotion.online', 'password': 'password123'})
token3 = data3['access_token']
print(f'Jordan login: {status} - role={data3["user"]["access_level"]}')
status, leads = req('GET', '/api/leads', headers={'Authorization': f'Bearer {token3}'})
print(f'Leads: {status} - {len(leads) if isinstance(leads, list) else leads}')
