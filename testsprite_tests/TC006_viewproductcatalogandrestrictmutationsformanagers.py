import requests
import json
import time

BASE_URL = "http://localhost:4000"
TIMEOUT = 30

def login(email: str, password: str) -> str:
    url = f"{BASE_URL}/api/auth/admin-login"
    payload = {"email": email, "password": password}
    headers = {"Content-Type": "application/json"}
    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT)
    response.raise_for_status()
    data = response.json()
    assert "token" in data and data["token"], "Token missing in login response"
    return data["token"]

def test_viewproductcatalogandrestrictmutationsformanagers():
    # Authenticate as GERENTE (manager)
    gerente_token = login("gerente.norte@fmb.com", "FmbPassword#2026")
    gerente_headers = {
        "Authorization": f"Bearer {gerente_token}",
        "Content-Type": "application/json"
    }

    # Authenticate as ADMIN
    admin_token = login("admin@fmb.com", "AdminPassword#2026")
    admin_headers = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }

    # GERENTE: GET /api/admin/products should succeed
    get_products_resp = requests.get(f"{BASE_URL}/api/admin/products",
                                     headers=gerente_headers,
                                     timeout=TIMEOUT)
    assert get_products_resp.status_code == 200, "Manager GET /api/admin/products failed"
    products_resp_json = get_products_resp.json()
    # Adjust for response possibly being an object containing the actual list
    if isinstance(products_resp_json, dict):
        if "products" in products_resp_json and isinstance(products_resp_json["products"], list):
            products = products_resp_json["products"]
        else:
            # fallback, try to find the first list in the dict
            products = None
            for v in products_resp_json.values():
                if isinstance(v, list):
                    products = v
                    break
            assert products is not None, "Product catalog response does not contain a product list"
    else:
        products = products_resp_json
    assert isinstance(products, list), "Product catalog response should be a list"

    # GERENTE: POST /api/admin/products should be forbidden (403)
    new_product_payload = {
        "name": "Test Product Gerente Attempt",
        "price": 10.99,
        "description": "Testing product mutation as gerente",
        "stockQuantity": 100
    }
    post_resp = requests.post(f"{BASE_URL}/api/admin/products",
                              headers=gerente_headers,
                              json=new_product_payload,
                              timeout=TIMEOUT)
    assert post_resp.status_code == 403, "Manager should not be able to POST /api/admin/products"

    # GERENTE: PUT /api/admin/products/{id} should be forbidden (403)
    # Try to update a product from fetched list if any, otherwise skip PUT test
    product_id = None
    if products and isinstance(products, list):
        for p in products:
            if "id" in p:
                product_id = p["id"]
                break
        if product_id:
            update_payload = {"price": 15.55}
            put_resp = requests.put(f"{BASE_URL}/api/admin/products/{product_id}",
                                    headers=gerente_headers,
                                    json=update_payload,
                                    timeout=TIMEOUT)
            assert put_resp.status_code == 403, "Manager should not be able to PUT /api/admin/products/{id}"

    # GERENTE: DELETE /api/admin/products/{id} should be forbidden (403)
    if products and product_id:
        del_resp = requests.delete(f"{BASE_URL}/api/admin/products/{product_id}",
                                   headers=gerente_headers,
                                   timeout=TIMEOUT)
        assert del_resp.status_code == 403, "Manager should not be able to DELETE /api/admin/products/{id}"

    # ADMIN: POST /api/admin/products should succeed and return created product with id
    created_product_id = None
    try:
        admin_create_payload = {
            "sku": f"TEST-PROD-ADMIN-{int(time.time())}",
            "barcode": f"999{int(time.time())}",
            "name": "Test Product Admin",
            "costPrice": 10.00,
            "sellPrice": 12.34,
            "description": "Product created by admin for test"
        }
        post_admin_resp = requests.post(f"{BASE_URL}/api/admin/products",
                                       headers=admin_headers,
                                       json=admin_create_payload,
                                       timeout=TIMEOUT)
        assert post_admin_resp.status_code == 201, f"Admin POST /api/admin/products failed: {post_admin_resp.text}"
        created_product_resp = post_admin_resp.json()
        assert "product" in created_product_resp, "Created response missing 'product' key"
        created_product = created_product_resp["product"]
        assert "id" in created_product, "Created product missing 'id'"
        created_product_id = created_product["id"]

        # ADMIN: PUT /api/admin/products/{id} to update product info should succeed
        update_admin_payload = {"sellPrice": 19.99}
        put_admin_resp = requests.put(f"{BASE_URL}/api/admin/products/{created_product_id}",
                                      headers=admin_headers,
                                      json=update_admin_payload,
                                      timeout=TIMEOUT)
        assert put_admin_resp.status_code == 200, f"Admin PUT /api/admin/products/{created_product_id} failed: {put_admin_resp.text}"
        updated_product_resp = put_admin_resp.json()
        assert "product" in updated_product_resp, "Updated response missing 'product' key"
        updated_product = updated_product_resp["product"]
        assert updated_product.get("sellPrice") == 19.99, "Product price not updated correctly"

        # ADMIN: GET the updated product should reflect the changes
        get_single_resp = requests.get(f"{BASE_URL}/api/admin/products/{created_product_id}",
                                       headers=admin_headers,
                                       timeout=TIMEOUT)
        assert get_single_resp.status_code == 200, f"Admin GET /api/admin/products/{created_product_id} failed: {get_single_resp.text}"
        single_product_resp = get_single_resp.json()
        assert "product" in single_product_resp, "GET single response missing 'product' key"
        single_product = single_product_resp["product"]
        assert single_product.get("sellPrice") == 19.99, "GET product price does not match updated value"
    finally:
        # Cleanup created product if exists
        if created_product_id:
            del_resp = requests.delete(f"{BASE_URL}/api/admin/products/{created_product_id}",
                                       headers=admin_headers,
                                       timeout=TIMEOUT)
            # Allow deletion to pass silently or assert 200/204
            assert del_resp.status_code in (200, 204), "Failed to delete test-created product"

test_viewproductcatalogandrestrictmutationsformanagers()
