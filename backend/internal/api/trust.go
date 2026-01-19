package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/matou-dao/backend/internal/anystore"
	"github.com/matou-dao/backend/internal/trust"
)

// TrustHandler handles trust graph related HTTP requests
type TrustHandler struct {
	store      *anystore.LocalStore
	orgAID     string
	calculator *trust.Calculator
}

// NewTrustHandler creates a new trust handler
func NewTrustHandler(store *anystore.LocalStore, orgAID string) *TrustHandler {
	return &TrustHandler{
		store:      store,
		orgAID:     orgAID,
		calculator: trust.NewDefaultCalculator(),
	}
}

// GraphResponse represents the trust graph API response
type GraphResponse struct {
	Graph   *trust.Graph         `json:"graph"`
	Summary *trust.ScoreSummary  `json:"summary,omitempty"`
}

// ScoreResponse represents a single trust score response
type ScoreResponse struct {
	Score *trust.Score `json:"score"`
}

// ScoresResponse represents multiple trust scores response
type ScoresResponse struct {
	Scores []*trust.Score `json:"scores"`
	Total  int            `json:"total"`
}

// HandleGetGraph handles GET /api/v1/trust/graph
// Query params:
//   - aid: Focus on specific AID (optional)
//   - depth: Depth limit for subgraph (optional, default: full graph)
//   - summary: Include summary stats (optional, default: false)
func (h *TrustHandler) HandleGetGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"error": "method not allowed",
		})
		return
	}

	ctx := r.Context()

	// Parse query parameters
	aidFilter := r.URL.Query().Get("aid")
	depthStr := r.URL.Query().Get("depth")
	includeSummary := r.URL.Query().Get("summary") == "true"

	// Create builder
	builder := trust.NewBuilder(h.store, h.orgAID)

	var graph *trust.Graph
	var err error

	// Build graph
	if aidFilter != "" {
		// Build subgraph focused on specific AID
		depth := 2 // Default depth
		if depthStr != "" {
			if d, parseErr := strconv.Atoi(depthStr); parseErr == nil && d > 0 {
				depth = d
			}
		}
		graph, err = builder.BuildForAID(ctx, aidFilter, depth)
	} else {
		// Build full graph
		graph, err = builder.Build(ctx)
	}

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to build trust graph: " + err.Error(),
		})
		return
	}

	// Build response
	resp := GraphResponse{
		Graph: graph,
	}

	// Include summary if requested
	if includeSummary {
		resp.Summary = h.calculator.CalculateSummary(graph)
	}

	writeJSON(w, http.StatusOK, resp)
}

// HandleGetScore handles GET /api/v1/trust/score/{aid}
func (h *TrustHandler) HandleGetScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"error": "method not allowed",
		})
		return
	}

	// Extract AID from path
	// Expected path: /api/v1/trust/score/{aid}
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 6 || parts[5] == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "AID is required in path: /api/v1/trust/score/{aid}",
		})
		return
	}
	aid := parts[5]

	ctx := r.Context()

	// Build graph
	builder := trust.NewBuilder(h.store, h.orgAID)
	graph, err := builder.Build(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to build trust graph: " + err.Error(),
		})
		return
	}

	// Check if AID exists in graph
	if graph.GetNode(aid) == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"error": "AID not found in trust graph",
		})
		return
	}

	// Calculate score
	score := h.calculator.CalculateScore(aid, graph)

	writeJSON(w, http.StatusOK, ScoreResponse{
		Score: score,
	})
}

// HandleGetScores handles GET /api/v1/trust/scores
// Query params:
//   - limit: Maximum number of scores to return (optional, default: 10)
//   - sort: Sort order - "score" (default), "depth", "credentials"
func (h *TrustHandler) HandleGetScores(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"error": "method not allowed",
		})
		return
	}

	ctx := r.Context()

	// Parse query parameters
	limitStr := r.URL.Query().Get("limit")
	limit := 10 // Default
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	// Build graph
	builder := trust.NewBuilder(h.store, h.orgAID)
	graph, err := builder.Build(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to build trust graph: " + err.Error(),
		})
		return
	}

	// Get top scores
	scores := h.calculator.GetTopScores(graph, limit)

	writeJSON(w, http.StatusOK, ScoresResponse{
		Scores: scores,
		Total:  len(scores),
	})
}

// HandleGetSummary handles GET /api/v1/trust/summary
func (h *TrustHandler) HandleGetSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"error": "method not allowed",
		})
		return
	}

	ctx := r.Context()

	// Build graph
	builder := trust.NewBuilder(h.store, h.orgAID)
	graph, err := builder.Build(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to build trust graph: " + err.Error(),
		})
		return
	}

	// Calculate summary
	summary := h.calculator.CalculateSummary(graph)

	writeJSON(w, http.StatusOK, summary)
}

// RegisterRoutes registers trust routes on the mux
func (h *TrustHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/trust/graph", h.HandleGetGraph)
	mux.HandleFunc("/api/v1/trust/score/", h.HandleGetScore)
	mux.HandleFunc("/api/v1/trust/scores", h.HandleGetScores)
	mux.HandleFunc("/api/v1/trust/summary", h.HandleGetSummary)
}
