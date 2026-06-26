import requests

BASE_URL = "http://localhost:4000"
TIMEOUT = 30

def test_admin_login_with_valid_credentials():
    url = f"{BASE_URL}/api/auth/admin-login"
    payload = {
        "email": "admin@fmb.com",
        "password": "AdminPassword#2026"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    json_response = response.json()
    assert "token" in json_response, "Token not found in response"
    token = json_response["token"]
    assert isinstance(token, str) and len(token) > 0, "Invalid token received"

test_admin_login_with_valid_credentials()