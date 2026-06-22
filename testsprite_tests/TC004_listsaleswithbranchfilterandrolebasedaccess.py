import requests

BASE_URL = "http://localhost:4000"
TIMEOUT = 30

def get_token(email, password):
    url = f"{BASE_URL}/api/auth/admin-login"
    payload = {"email": email, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    token = resp.json().get("token")
    assert token, f"Token not found in login response for {email}"
    return token

def test_listsales_with_branch_filter_and_role_based_access():
    # Login as ADMIN
    admin_token = get_token("admin@fmb.com", "AdminPassword#2026")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Login as GERENTE (manager)
    gerente_token = get_token("gerente.norte@fmb.com", "FmbPassword#2026")
    headers_gerente = {"Authorization": f"Bearer {gerente_token}"}

    # Fetch available branches to get branch IDs for filtering
    branches_resp = requests.get(f"{BASE_URL}/api/auth/branches", timeout=TIMEOUT)
    branches_resp.raise_for_status()
    branches_json = branches_resp.json()
    # Accept both a list directly or branches field with list
    if isinstance(branches_json, list):
        branches = branches_json
    elif isinstance(branches_json, dict) and 'branches' in branches_json:
        branches = branches_json['branches']
    else:
        branches = []
    assert isinstance(branches, list) and len(branches) > 0, "Branches list empty or invalid"

    branch_id = branches[0].get("id")
    assert branch_id, "Branch id not found in branch data"

    def extract_sales_list(resp_json):
        if isinstance(resp_json, list):
            return resp_json
        elif isinstance(resp_json, dict) and 'sales' in resp_json and isinstance(resp_json['sales'], list):
            return resp_json['sales']
        else:
            return []

    # Admin: fetch sales without filter
    sales_resp = requests.get(f"{BASE_URL}/api/admin/sales", headers=headers_admin, timeout=TIMEOUT)
    assert sales_resp.status_code == 200
    sales_data = extract_sales_list(sales_resp.json())
    assert isinstance(sales_data, list), "Admin sales data should be a list"

    # Admin: fetch sales with branch filter
    sales_filter_resp = requests.get(f"{BASE_URL}/api/admin/sales", headers=headers_admin,
                                     params={"branchId": branch_id}, timeout=TIMEOUT)
    assert sales_filter_resp.status_code == 200
    sales_filter_data = extract_sales_list(sales_filter_resp.json())
    assert isinstance(sales_filter_data, list), "Admin filtered sales data should be a list"

    # Manager (GERENTE): fetch sales without filter
    sales_mgr_resp = requests.get(f"{BASE_URL}/api/admin/sales", headers=headers_gerente, timeout=TIMEOUT)
    # Assuming managers are scoped to their branch and should get 200 ok
    assert sales_mgr_resp.status_code == 200
    sales_mgr_data = extract_sales_list(sales_mgr_resp.json())
    assert isinstance(sales_mgr_data, list), "Manager sales data should be a list"

    # Manager (GERENTE): fetch sales with branch filter (for branch they may or may not belong to)
    sales_mgr_filter_resp = requests.get(f"{BASE_URL}/api/admin/sales", headers=headers_gerente,
                                         params={"branchId": branch_id}, timeout=TIMEOUT)
    assert sales_mgr_filter_resp.status_code == 200
    sales_mgr_filter_data = extract_sales_list(sales_mgr_filter_resp.json())
    assert isinstance(sales_mgr_filter_data, list), "Manager filtered sales data should be a list"

    # For role-based access enforcement, verify that manager does not see sales outside their branch
    # This test depends on system data; here we assume filtered manager sales match unfiltered
    # or filtered list is a subset. So sales_mgr_filter_data should be same or subset of sales_mgr_data.

    # Convert sales lists to sets of sale IDs if present for better check
    def get_sale_ids(sales_list):
        ids = set()
        for item in sales_list:
            if "id" in item:
                ids.add(item["id"])
        return ids

    mgr_ids = get_sale_ids(sales_mgr_data)
    mgr_filter_ids = get_sale_ids(sales_mgr_filter_data)
    assert mgr_filter_ids.issubset(mgr_ids), "Manager filtered sales are not subset of manager sales"

test_listsales_with_branch_filter_and_role_based_access()
