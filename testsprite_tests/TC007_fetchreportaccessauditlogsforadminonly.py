import requests

BASE_URL = "http://localhost:4000"
TIMEOUT = 30

def login(email, password):
    url = f"{BASE_URL}/api/auth/admin-login"
    payload = {"email": email, "password": password}
    response = requests.post(url, json=payload, timeout=TIMEOUT)
    response.raise_for_status()
    data = response.json()
    assert "token" in data, "Token not found in login response"
    return data["token"]

def test_fetchreportaccessauditlogsforadminonly():
    # Admin credentials
    admin_email = "admin@fmb.com"
    admin_password = "AdminPassword#2026"
    # Gerente credentials
    gerente_email = "gerente.norte@fmb.com"
    gerente_password = "FmbPassword#2026"
    audit_logs_endpoint = f"{BASE_URL}/api/admin/reports/audit-logs"

    # Step 1: Login as ADMIN and fetch audit logs, expect success and correct data structure
    admin_token = login(admin_email, admin_password)
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    response_admin = requests.get(audit_logs_endpoint, headers=headers_admin, timeout=TIMEOUT)
    assert response_admin.status_code == 200, f"Admin should access audit logs, got {response_admin.status_code}"
    audit_logs_resp = response_admin.json()
    # Handle case where response is a dict representing the logs
    if isinstance(audit_logs_resp, dict):
        if "logs" in audit_logs_resp and isinstance(audit_logs_resp["logs"], list):
            audit_logs = audit_logs_resp["logs"]
        else:
            audit_logs = [audit_logs_resp]
    elif isinstance(audit_logs_resp, list):
        audit_logs = audit_logs_resp
    else:
        assert False, "Audit logs response is neither list nor dict"
    assert isinstance(audit_logs, list), "Audit logs should be a list"
    # Basic validation of audit log item structure if present
    if len(audit_logs) > 0:
        log = audit_logs[0]
        assert isinstance(log, dict), "Each audit log entry should be a dictionary"
        assert "id" in log, "Audit log entry missing 'id'"
        assert "user" in log, "Audit log entry missing 'user'"
        assert "reportName" in log, "Audit log entry missing 'reportName'"
        assert "reportType" in log, "Audit log entry missing 'reportType'"
        assert "createdAt" in log, "Audit log entry missing 'createdAt'"

    # Step 2: Login as GERENTE and attempt to fetch audit logs, expect 403 Forbidden
    gerente_token = login(gerente_email, gerente_password)
    headers_gerente = {"Authorization": f"Bearer {gerente_token}"}
    response_gerente = requests.get(audit_logs_endpoint, headers=headers_gerente, timeout=TIMEOUT)
    assert response_gerente.status_code == 403, f"Gerente should be forbidden from audit logs, got {response_gerente.status_code}"

test_fetchreportaccessauditlogsforadminonly()
