import requests

def test_fetch_available_branches():
    base_url = "http://localhost:4000"
    url = f"{base_url}/api/auth/branches"
    headers = {
        "Accept": "application/json"
    }
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        assert False, f"Request failed: {e}"
    
    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"
    
    try:
        response_json = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(response_json, dict), "Response JSON is not a dictionary/object"

    assert "branches" in response_json, "Response JSON does not contain 'branches' key"

    branches = response_json["branches"]

    assert isinstance(branches, list), "'branches' is not a list"

    # Validate branch objects if available in the list
    if branches:
        branch = branches[0]
        assert isinstance(branch, dict), "Branch item is not a dictionary"
        # Check for expected branch fields: 'id' and 'name'
        expected_keys = {"id", "name"}
        missing_keys = expected_keys - branch.keys()
        assert not missing_keys, f"Missing expected keys in branch item: {missing_keys}"

test_fetch_available_branches()
