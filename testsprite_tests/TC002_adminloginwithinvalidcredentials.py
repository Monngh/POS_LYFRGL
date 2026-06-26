import requests

def test_adminloginwithinvalidcredentials():
    base_url = "http://localhost:4000"
    url = f"{base_url}/api/auth/admin-login"
    invalid_payload = {
        "email": "admin@fmb.com",
        "password": "WrongPassword#2026"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, json=invalid_payload, headers=headers, timeout=30)
        assert response.status_code == 401 or response.status_code == 400, \
            f"Expected 401 or 400 Unauthorized/Bad Request but got {response.status_code}"
        json_response = response.json()
        assert "token" not in json_response, "Token should not be present in response on failed login"
        assert "error" in json_response or "message" in json_response, "Error message should be present in the response"
        error_msg = json_response.get("error") or json_response.get("message")
        assert isinstance(error_msg, str) and len(error_msg) > 0, "Error message should be a non-empty string"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_adminloginwithinvalidcredentials()