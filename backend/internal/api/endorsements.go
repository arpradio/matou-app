package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/matou-dao/backend/internal/anystore"
)

// EndorsementsHandler handles endorsement-related HTTP requests.
// Endorsements are synced from the frontend after being issued via signify-ts.
type EndorsementsHandler struct {
	store *anystore.LocalStore
}

// NewEndorsementsHandler creates a new endorsements handler
func NewEndorsementsHandler(store *anystore.LocalStore) *EndorsementsHandler {
	return &EndorsementsHandler{
		store: store,
	}
}

// Endorsement represents an endorsement record
type Endorsement struct {
	SAID             string `json:"said"`
	EndorserAID      string `json:"endorserAid"`
	EndorserName     string `json:"endorserName,omitempty"`
	EndorseeAID      string `json:"endorseeAid"`
	EndorseeName     string `json:"endorseeName,omitempty"`
	EndorsementType  string `json:"endorsementType"`
	Category         string `json:"category,omitempty"`
	Claim            string `json:"claim"`
	Evidence         string `json:"evidence,omitempty"`
	Confidence       string `json:"confidence"`
	Relationship     string `json:"relationship,omitempty"`
	MembershipSAID   string `json:"membershipSaid"`
	IssuedAt         string `json:"issuedAt"`
	Revoked          bool   `json:"revoked,omitempty"`
	RevokedAt        string `json:"revokedAt,omitempty"`
	RevocationReason string `json:"revocationReason,omitempty"`
	RevocationSAID   string `json:"revocationSaid,omitempty"`
}

// SyncEndorsementRequest represents a sync request from frontend
type SyncEndorsementRequest struct {
	Endorsement Endorsement `json:"endorsement"`
}

// SyncEndorsementResponse represents a sync response
type SyncEndorsementResponse struct {
	Success bool   `json:"success"`
	SAID    string `json:"said,omitempty"`
	Error   string `json:"error,omitempty"`
}

// ListEndorsementsResponse represents an endorsement list response
type ListEndorsementsResponse struct {
	Endorsements []Endorsement `json:"endorsements"`
	Total        int           `json:"total"`
}

// RevokeRequest represents a revocation request
type RevokeRequest struct {
	EndorsementSAID string `json:"endorsementSaid"`
	RevocationSAID  string `json:"revocationSaid"`
	Reason          string `json:"reason"`
	RevokedAt       string `json:"revokedAt"`
}

// HandleGetByMember handles GET /api/v1/endorsements/{aid}
// Returns all endorsements where the specified AID is the endorsee
func (h *EndorsementsHandler) HandleGetByMember(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, ListEndorsementsResponse{})
		return
	}

	// Extract AID from path
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "member AID required",
		})
		return
	}
	memberAID := parts[4]

	// Check if this is an "issued" query
	if memberAID == "issued" && len(parts) > 5 {
		h.HandleGetIssued(w, r)
		return
	}

	ctx := context.Background()
	endorsements, err := h.store.GetEndorsementsForMember(ctx, memberAID)
	if err != nil {
		// Return empty list on error (no endorsements found is ok)
		writeJSON(w, http.StatusOK, ListEndorsementsResponse{
			Endorsements: []Endorsement{},
			Total:        0,
		})
		return
	}

	// Convert to API format
	result := make([]Endorsement, 0, len(endorsements))
	for _, e := range endorsements {
		result = append(result, Endorsement{
			SAID:             e.SAID,
			EndorserAID:      e.EndorserAID,
			EndorserName:     e.EndorserName,
			EndorseeAID:      e.EndorseeAID,
			EndorseeName:     e.EndorseeName,
			EndorsementType:  e.EndorsementType,
			Category:         e.Category,
			Claim:            e.Claim,
			Evidence:         e.Evidence,
			Confidence:       e.Confidence,
			Relationship:     e.Relationship,
			MembershipSAID:   e.MembershipSAID,
			IssuedAt:         e.IssuedAt,
			Revoked:          e.Revoked,
			RevokedAt:        e.RevokedAt,
			RevocationReason: e.RevocationReason,
			RevocationSAID:   e.RevocationSAID,
		})
	}

	writeJSON(w, http.StatusOK, ListEndorsementsResponse{
		Endorsements: result,
		Total:        len(result),
	})
}

// HandleGetIssued handles GET /api/v1/endorsements/issued/{aid}
// Returns all endorsements issued by the specified AID
func (h *EndorsementsHandler) HandleGetIssued(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, ListEndorsementsResponse{})
		return
	}

	// Extract AID from path
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "endorser AID required",
		})
		return
	}
	endorserAID := parts[5]

	ctx := context.Background()
	endorsements, err := h.store.GetEndorsementsIssuedBy(ctx, endorserAID)
	if err != nil {
		writeJSON(w, http.StatusOK, ListEndorsementsResponse{
			Endorsements: []Endorsement{},
			Total:        0,
		})
		return
	}

	// Convert to API format
	result := make([]Endorsement, 0, len(endorsements))
	for _, e := range endorsements {
		result = append(result, Endorsement{
			SAID:             e.SAID,
			EndorserAID:      e.EndorserAID,
			EndorserName:     e.EndorserName,
			EndorseeAID:      e.EndorseeAID,
			EndorseeName:     e.EndorseeName,
			EndorsementType:  e.EndorsementType,
			Category:         e.Category,
			Claim:            e.Claim,
			Evidence:         e.Evidence,
			Confidence:       e.Confidence,
			Relationship:     e.Relationship,
			MembershipSAID:   e.MembershipSAID,
			IssuedAt:         e.IssuedAt,
			Revoked:          e.Revoked,
			RevokedAt:        e.RevokedAt,
			RevocationReason: e.RevocationReason,
			RevocationSAID:   e.RevocationSAID,
		})
	}

	writeJSON(w, http.StatusOK, ListEndorsementsResponse{
		Endorsements: result,
		Total:        len(result),
	})
}

// HandleSync handles POST /api/v1/endorsements/sync
// Stores an endorsement synced from the frontend
func (h *EndorsementsHandler) HandleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, SyncEndorsementResponse{
			Success: false,
			Error:   "method not allowed",
		})
		return
	}

	var req SyncEndorsementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, SyncEndorsementResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid request: %v", err),
		})
		return
	}

	// Validate required fields
	if req.Endorsement.SAID == "" {
		writeJSON(w, http.StatusBadRequest, SyncEndorsementResponse{
			Success: false,
			Error:   "endorsement SAID required",
		})
		return
	}

	// Store endorsement
	ctx := context.Background()
	cached := &anystore.CachedEndorsement{
		SAID:             req.Endorsement.SAID,
		EndorserAID:      req.Endorsement.EndorserAID,
		EndorserName:     req.Endorsement.EndorserName,
		EndorseeAID:      req.Endorsement.EndorseeAID,
		EndorseeName:     req.Endorsement.EndorseeName,
		EndorsementType:  req.Endorsement.EndorsementType,
		Category:         req.Endorsement.Category,
		Claim:            req.Endorsement.Claim,
		Evidence:         req.Endorsement.Evidence,
		Confidence:       req.Endorsement.Confidence,
		Relationship:     req.Endorsement.Relationship,
		MembershipSAID:   req.Endorsement.MembershipSAID,
		IssuedAt:         req.Endorsement.IssuedAt,
		Revoked:          false,
		CachedAt:         time.Now().UTC(),
	}

	if err := h.store.StoreEndorsement(ctx, cached); err != nil {
		writeJSON(w, http.StatusInternalServerError, SyncEndorsementResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to store endorsement: %v", err),
		})
		return
	}

	writeJSON(w, http.StatusOK, SyncEndorsementResponse{
		Success: true,
		SAID:    req.Endorsement.SAID,
	})
}

// HandleRevoke handles POST /api/v1/endorsements/revoke
// Marks an endorsement as revoked
func (h *EndorsementsHandler) HandleRevoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, SyncEndorsementResponse{
			Success: false,
			Error:   "method not allowed",
		})
		return
	}

	var req RevokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, SyncEndorsementResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid request: %v", err),
		})
		return
	}

	if req.EndorsementSAID == "" {
		writeJSON(w, http.StatusBadRequest, SyncEndorsementResponse{
			Success: false,
			Error:   "endorsementSaid required",
		})
		return
	}

	ctx := context.Background()
	if err := h.store.RevokeEndorsement(ctx, req.EndorsementSAID, req.RevocationSAID, req.Reason, req.RevokedAt); err != nil {
		writeJSON(w, http.StatusInternalServerError, SyncEndorsementResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to revoke endorsement: %v", err),
		})
		return
	}

	writeJSON(w, http.StatusOK, SyncEndorsementResponse{
		Success: true,
		SAID:    req.EndorsementSAID,
	})
}

// RegisterRoutes registers endorsement routes on the mux
func (h *EndorsementsHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/endorsements/sync", CORSHandler(h.HandleSync))
	mux.HandleFunc("/api/v1/endorsements/revoke", CORSHandler(h.HandleRevoke))
	mux.HandleFunc("/api/v1/endorsements/issued/", CORSHandler(h.HandleGetIssued))
	mux.HandleFunc("/api/v1/endorsements/", CORSHandler(h.HandleGetByMember))
}
