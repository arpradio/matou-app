package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/matou-dao/backend/internal/keri"
)

// CredentialsHandler handles credential-related HTTP requests
type CredentialsHandler struct {
	keriClient *keri.Client
}

// NewCredentialsHandler creates a new credentials handler
func NewCredentialsHandler(keriClient *keri.Client) *CredentialsHandler {
	return &CredentialsHandler{
		keriClient: keriClient,
	}
}

// IssueRequest represents a credential issuance request
type IssueRequest struct {
	RecipientAID string `json:"recipientAid"`
	Role         string `json:"role"`
	ExpiresAt    string `json:"expiresAt,omitempty"`
}

// IssueResponse represents a credential issuance response
type IssueResponse struct {
	Success    bool                   `json:"success"`
	Credential *keri.CredentialResult `json:"credential,omitempty"`
	Error      string                 `json:"error,omitempty"`
}

// VerifyRequest represents a credential verification request
type VerifyRequest struct {
	Credential json.RawMessage `json:"credential"`
}

// VerifyResponse represents a credential verification response
type VerifyResponse struct {
	Valid   bool   `json:"valid"`
	Issuer  string `json:"issuer,omitempty"`
	Role    string `json:"role,omitempty"`
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// RolesResponse lists available roles
type RolesResponse struct {
	Roles []RoleInfo `json:"roles"`
}

// RoleInfo describes a role and its permissions
type RoleInfo struct {
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
}

// HandleIssue handles POST /api/v1/credentials/issue
func (h *CredentialsHandler) HandleIssue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, IssueResponse{
			Success: false,
			Error:   "method not allowed",
		})
		return
	}

	var req IssueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, IssueResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid request: %v", err),
		})
		return
	}

	// Validate request
	if req.RecipientAID == "" {
		writeJSON(w, http.StatusBadRequest, IssueResponse{
			Success: false,
			Error:   "recipientAid is required",
		})
		return
	}

	if !keri.IsValidRole(req.Role) {
		writeJSON(w, http.StatusBadRequest, IssueResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid role: %s. Valid roles: %v", req.Role, keri.ValidRoles()),
		})
		return
	}

	// Prepare credential data
	data := &keri.CredentialData{
		JoinedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if req.ExpiresAt != "" {
		data.ExpiresAt = req.ExpiresAt
	}

	// Issue credential
	cred, err := h.keriClient.IssueCredential(req.RecipientAID, req.Role, data)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, IssueResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to issue credential: %v", err),
		})
		return
	}

	writeJSON(w, http.StatusOK, IssueResponse{
		Success:    true,
		Credential: cred,
	})
}

// HandleVerify handles POST /api/v1/credentials/verify
func (h *CredentialsHandler) HandleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, VerifyResponse{
			Valid: false,
			Error: "method not allowed",
		})
		return
	}

	var req VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, VerifyResponse{
			Valid: false,
			Error: fmt.Sprintf("invalid request: %v", err),
		})
		return
	}

	if len(req.Credential) == 0 {
		writeJSON(w, http.StatusBadRequest, VerifyResponse{
			Valid: false,
			Error: "credential is required",
		})
		return
	}

	// Verify credential
	valid, err := h.keriClient.VerifyCredential(string(req.Credential))
	if err != nil {
		writeJSON(w, http.StatusOK, VerifyResponse{
			Valid:   false,
			Error:   err.Error(),
			Message: "Credential verification failed",
		})
		return
	}

	// Parse credential to get issuer and role
	var cred keri.CredentialResult
	if err := json.Unmarshal(req.Credential, &cred); err == nil {
		writeJSON(w, http.StatusOK, VerifyResponse{
			Valid:   valid,
			Issuer:  cred.Issuer,
			Role:    cred.Data.Role,
			Message: "Credential is valid",
		})
		return
	}

	writeJSON(w, http.StatusOK, VerifyResponse{
		Valid:   valid,
		Message: "Credential is valid",
	})
}

// HandleRoles handles GET /api/v1/credentials/roles
func (h *CredentialsHandler) HandleRoles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"error": "method not allowed",
		})
		return
	}

	roles := make([]RoleInfo, 0, len(keri.ValidRoles()))
	for _, role := range keri.ValidRoles() {
		roles = append(roles, RoleInfo{
			Name:        role,
			Permissions: keri.GetPermissionsForRole(role),
		})
	}

	writeJSON(w, http.StatusOK, RolesResponse{Roles: roles})
}

// RegisterRoutes registers credential routes on the mux
func (h *CredentialsHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/credentials/issue", h.HandleIssue)
	mux.HandleFunc("/api/v1/credentials/verify", h.HandleVerify)
	mux.HandleFunc("/api/v1/credentials/roles", h.HandleRoles)
}

// writeJSON writes a JSON response
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
