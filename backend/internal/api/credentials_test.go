package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/matou-dao/backend/internal/keri"
)

func setupTestHandler(t *testing.T) *CredentialsHandler {
	cfg := &keri.Config{
		ContainerName: "test-container",
		OrgName:       "test-org",
		OrgPasscode:   "test-passcode",
		OrgAlias:      "test-alias",
	}
	client, err := keri.NewClient(cfg)
	if err != nil {
		t.Fatalf("failed to create KERI client: %v", err)
	}
	return NewCredentialsHandler(client)
}

func TestHandleRoles(t *testing.T) {
	handler := setupTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/credentials/roles", nil)
	w := httptest.NewRecorder()

	handler.HandleRoles(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}

	var resp RolesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(resp.Roles) != 8 {
		t.Errorf("expected 8 roles, got %d", len(resp.Roles))
	}

	// Check that each role has permissions
	for _, role := range resp.Roles {
		if role.Name == "" {
			t.Error("role name should not be empty")
		}
		if len(role.Permissions) == 0 {
			t.Errorf("role %s should have permissions", role.Name)
		}
	}
}

func TestHandleRoles_MethodNotAllowed(t *testing.T) {
	handler := setupTestHandler(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/roles", nil)
	w := httptest.NewRecorder()

	handler.HandleRoles(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status %d, got %d", http.StatusMethodNotAllowed, w.Code)
	}
}

func TestHandleIssue_InvalidMethod(t *testing.T) {
	handler := setupTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/credentials/issue", nil)
	w := httptest.NewRecorder()

	handler.HandleIssue(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status %d, got %d", http.StatusMethodNotAllowed, w.Code)
	}
}

func TestHandleIssue_MissingRecipient(t *testing.T) {
	handler := setupTestHandler(t)

	body := `{"role": "Member"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/issue", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleIssue(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp IssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success to be false")
	}
	if resp.Error == "" {
		t.Error("expected error message")
	}
}

func TestHandleIssue_InvalidRole(t *testing.T) {
	handler := setupTestHandler(t)

	body := `{"recipientAid": "EAID123456789", "role": "SuperAdmin"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/issue", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleIssue(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestHandleIssue_InvalidJSON(t *testing.T) {
	handler := setupTestHandler(t)

	body := `{invalid json}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/issue", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleIssue(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestHandleVerify_InvalidMethod(t *testing.T) {
	handler := setupTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/credentials/verify", nil)
	w := httptest.NewRecorder()

	handler.HandleVerify(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status %d, got %d", http.StatusMethodNotAllowed, w.Code)
	}
}

func TestHandleVerify_MissingCredential(t *testing.T) {
	handler := setupTestHandler(t)

	body := `{}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/verify", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleVerify(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp VerifyResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Valid {
		t.Error("expected valid to be false")
	}
}

func TestHandleVerify_InvalidCredentialFormat(t *testing.T) {
	handler := setupTestHandler(t)

	body := `{"credential": {"said": "", "issuer": ""}}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/verify", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleVerify(w, req)

	// Should return 200 with valid=false
	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}

	var resp VerifyResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Valid {
		t.Error("expected valid to be false for empty SAID")
	}
}

func TestRegisterRoutes(t *testing.T) {
	handler := setupTestHandler(t)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Test that routes are registered by making requests
	paths := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/credentials/roles"},
		{http.MethodPost, "/api/v1/credentials/issue"},
		{http.MethodPost, "/api/v1/credentials/verify"},
	}

	for _, p := range paths {
		t.Run(p.path, func(t *testing.T) {
			var body *bytes.Buffer
			if p.method == http.MethodPost {
				body = bytes.NewBufferString("{}")
			} else {
				body = &bytes.Buffer{}
			}
			req := httptest.NewRequest(p.method, p.path, body)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, req)

			// Should not be 404
			if w.Code == http.StatusNotFound {
				t.Errorf("route %s %s not registered", p.method, p.path)
			}
		})
	}
}
