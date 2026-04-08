package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func setup() {
	os.Setenv("API_ADMIN_TOKEN", "test-admin-token")
	os.Setenv("API_OPERATOR_TOKEN", "test-operator-token")
	os.Setenv("API_VIEWER_TOKEN", "test-viewer-token")
}

func makeRequest(method, path, authHeader string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	rr := httptest.NewRecorder()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/ready", handleReady)
	mux.HandleFunc("/auth/identity", handleIdentity)
	mux.HandleFunc("/ops/ping", handleOpsPing)
	mux.HandleFunc("/admin", handleAdmin)
	mux.HandleFunc("/admin/", handleAdmin)
	mux.HandleFunc("/", handleRoot)
	mux.ServeHTTP(rr, req)
	return rr
}

// Case 1: /health is public — no token required
func TestHealthPublic(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/health", "")
	if rr.Code != http.StatusOK {
		t.Errorf("case 1: /health public: want 200 got %d", rr.Code)
	}
}

// Case 2: /admin no token → 401
func TestAdminNoToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/admin", "")
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("case 2: /admin no token: want 401 got %d", rr.Code)
	}
}

// Case 3: /admin viewer token → 403
func TestAdminViewerToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/admin", "Bearer test-viewer-token")
	if rr.Code != http.StatusForbidden {
		t.Errorf("case 3: /admin viewer: want 403 got %d", rr.Code)
	}
}

// Case 4: /admin operator token → 403
func TestAdminOperatorToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/admin", "Bearer test-operator-token")
	if rr.Code != http.StatusForbidden {
		t.Errorf("case 4: /admin operator: want 403 got %d", rr.Code)
	}
}

// Case 5: /admin admin token → 200
func TestAdminAdminToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/admin", "Bearer test-admin-token")
	if rr.Code != http.StatusOK {
		t.Errorf("case 5: /admin admin: want 200 got %d", rr.Code)
	}
}

// Case 6: /auth/identity no token → 401
func TestIdentityNoToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/auth/identity", "")
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("case 6: /auth/identity no token: want 401 got %d", rr.Code)
	}
}

// Case 7: /auth/identity viewer token → 200
func TestIdentityViewerToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/auth/identity", "Bearer test-viewer-token")
	if rr.Code != http.StatusOK {
		t.Errorf("case 7: /auth/identity viewer: want 200 got %d", rr.Code)
	}
}

// Case 8: /ops/ping no token → 401
func TestOpsPingNoToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/ops/ping", "")
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("case 8: /ops/ping no token: want 401 got %d", rr.Code)
	}
}

// Case 9: /ops/ping viewer token → 403
func TestOpsPingViewerToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/ops/ping", "Bearer test-viewer-token")
	if rr.Code != http.StatusForbidden {
		t.Errorf("case 9: /ops/ping viewer: want 403 got %d", rr.Code)
	}
}

// Case 10: /ops/ping operator token → 200
func TestOpsPingOperatorToken(t *testing.T) {
	setup()
	rr := makeRequest("GET", "/ops/ping", "Bearer test-operator-token")
	if rr.Code != http.StatusOK {
		t.Errorf("case 10: /ops/ping operator: want 200 got %d", rr.Code)
	}
}
