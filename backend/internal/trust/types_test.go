package trust

import (
	"testing"
	"time"
)

func TestNewGraph(t *testing.T) {
	orgAID := "EORG123"
	graph := NewGraph(orgAID)

	if graph == nil {
		t.Fatal("NewGraph returned nil")
	}
	if graph.OrgAID != orgAID {
		t.Errorf("expected OrgAID %s, got %s", orgAID, graph.OrgAID)
	}
	if graph.Nodes == nil {
		t.Error("Nodes map is nil")
	}
	if graph.Edges == nil {
		t.Error("Edges slice is nil")
	}
	if graph.Updated.IsZero() {
		t.Error("Updated time should be set")
	}
}

func TestGraph_AddNode(t *testing.T) {
	graph := NewGraph("EORG123")

	node := &Node{
		AID:   "EUSER1",
		Alias: "alice",
		Role:  "Member",
	}
	graph.AddNode(node)

	if len(graph.Nodes) != 1 {
		t.Errorf("expected 1 node, got %d", len(graph.Nodes))
	}
	if graph.Nodes["EUSER1"] == nil {
		t.Error("node not found in map")
	}
	if graph.Nodes["EUSER1"].CredentialCount != 1 {
		t.Errorf("expected CredentialCount 1, got %d", graph.Nodes["EUSER1"].CredentialCount)
	}

	// Add same node again - should update credential count
	graph.AddNode(&Node{AID: "EUSER1", Role: "Verified Member"})
	if graph.Nodes["EUSER1"].CredentialCount != 2 {
		t.Errorf("expected CredentialCount 2, got %d", graph.Nodes["EUSER1"].CredentialCount)
	}
	if graph.Nodes["EUSER1"].Role != "Verified Member" {
		t.Errorf("expected role update, got %s", graph.Nodes["EUSER1"].Role)
	}
}

func TestGraph_AddEdge(t *testing.T) {
	graph := NewGraph("EORG123")

	edge := &Edge{
		From:         "EORG123",
		To:           "EUSER1",
		CredentialID: "ESAID001",
		Type:         EdgeTypeMembership,
	}
	graph.AddEdge(edge)

	if len(graph.Edges) != 1 {
		t.Errorf("expected 1 edge, got %d", len(graph.Edges))
	}

	// Add same edge again - should not duplicate
	graph.AddEdge(edge)
	if len(graph.Edges) != 1 {
		t.Errorf("expected 1 edge (no duplicate), got %d", len(graph.Edges))
	}

	// Add different edge
	graph.AddEdge(&Edge{
		From:         "EORG123",
		To:           "EUSER2",
		CredentialID: "ESAID002",
		Type:         EdgeTypeMembership,
	})
	if len(graph.Edges) != 2 {
		t.Errorf("expected 2 edges, got %d", len(graph.Edges))
	}
}

func TestGraph_GetNode(t *testing.T) {
	graph := NewGraph("EORG123")
	graph.AddNode(&Node{AID: "EUSER1", Alias: "alice"})

	node := graph.GetNode("EUSER1")
	if node == nil {
		t.Error("expected node, got nil")
	}
	if node.Alias != "alice" {
		t.Errorf("expected alias alice, got %s", node.Alias)
	}

	// Non-existent node
	node = graph.GetNode("NONEXISTENT")
	if node != nil {
		t.Error("expected nil for non-existent node")
	}
}

func TestGraph_GetEdgesFrom(t *testing.T) {
	graph := NewGraph("EORG123")
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER2", CredentialID: "E2"})
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER2", CredentialID: "E3"})

	edges := graph.GetEdgesFrom("EORG123")
	if len(edges) != 2 {
		t.Errorf("expected 2 edges from EORG123, got %d", len(edges))
	}

	edges = graph.GetEdgesFrom("EUSER1")
	if len(edges) != 1 {
		t.Errorf("expected 1 edge from EUSER1, got %d", len(edges))
	}

	edges = graph.GetEdgesFrom("NONEXISTENT")
	if len(edges) != 0 {
		t.Errorf("expected 0 edges, got %d", len(edges))
	}
}

func TestGraph_GetEdgesTo(t *testing.T) {
	graph := NewGraph("EORG123")
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER2", CredentialID: "E2"})
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER2", CredentialID: "E3"})

	edges := graph.GetEdgesTo("EUSER2")
	if len(edges) != 2 {
		t.Errorf("expected 2 edges to EUSER2, got %d", len(edges))
	}

	edges = graph.GetEdgesTo("EUSER1")
	if len(edges) != 1 {
		t.Errorf("expected 1 edge to EUSER1, got %d", len(edges))
	}
}

func TestGraph_HasBidirectionalRelation(t *testing.T) {
	graph := NewGraph("EORG123")
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER2", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EUSER2", To: "EUSER1", CredentialID: "E2"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E3"})

	if !graph.HasBidirectionalRelation("EUSER1", "EUSER2") {
		t.Error("expected bidirectional relation between EUSER1 and EUSER2")
	}
	if !graph.HasBidirectionalRelation("EUSER2", "EUSER1") {
		t.Error("expected bidirectional relation between EUSER2 and EUSER1")
	}
	if graph.HasBidirectionalRelation("EORG123", "EUSER1") {
		t.Error("expected no bidirectional relation between EORG123 and EUSER1")
	}
}

func TestGraph_MarkBidirectionalEdges(t *testing.T) {
	graph := NewGraph("EORG123")
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER2", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EUSER2", To: "EUSER1", CredentialID: "E2"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E3"})

	graph.MarkBidirectionalEdges()

	// Check bidirectional flags
	bidirectionalCount := 0
	for _, edge := range graph.Edges {
		if edge.Bidirectional {
			bidirectionalCount++
		}
	}

	if bidirectionalCount != 2 {
		t.Errorf("expected 2 bidirectional edges, got %d", bidirectionalCount)
	}
}

func TestGraph_NodeCount(t *testing.T) {
	graph := NewGraph("EORG123")
	if graph.NodeCount() != 0 {
		t.Errorf("expected 0 nodes, got %d", graph.NodeCount())
	}

	graph.AddNode(&Node{AID: "EUSER1"})
	graph.AddNode(&Node{AID: "EUSER2"})

	if graph.NodeCount() != 2 {
		t.Errorf("expected 2 nodes, got %d", graph.NodeCount())
	}
}

func TestGraph_EdgeCount(t *testing.T) {
	graph := NewGraph("EORG123")
	if graph.EdgeCount() != 0 {
		t.Errorf("expected 0 edges, got %d", graph.EdgeCount())
	}

	graph.AddEdge(&Edge{From: "A", To: "B", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "B", To: "C", CredentialID: "E2"})

	if graph.EdgeCount() != 2 {
		t.Errorf("expected 2 edges, got %d", graph.EdgeCount())
	}
}

func TestSchemaToEdgeType(t *testing.T) {
	tests := []struct {
		schema   string
		expected string
	}{
		{"EMatouMembershipSchemaV1", EdgeTypeMembership},
		{"EOperationsStewardSchemaV1", EdgeTypeSteward},
		{"EInvitationSchemaV1", EdgeTypeInvitation},
		{"ESelfClaimSchemaV1", EdgeTypeSelfClaim},
		{"UnknownSchema", "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.schema, func(t *testing.T) {
			result := SchemaToEdgeType(tt.schema)
			if result != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestNode_Fields(t *testing.T) {
	joinedAt := time.Now()
	node := &Node{
		AID:             "EUSER1",
		Alias:           "alice",
		Role:            "Member",
		JoinedAt:        joinedAt,
		CredentialCount: 5,
	}

	if node.AID != "EUSER1" {
		t.Errorf("expected AID EUSER1, got %s", node.AID)
	}
	if node.Alias != "alice" {
		t.Errorf("expected Alias alice, got %s", node.Alias)
	}
	if node.Role != "Member" {
		t.Errorf("expected Role Member, got %s", node.Role)
	}
	if !node.JoinedAt.Equal(joinedAt) {
		t.Error("JoinedAt mismatch")
	}
	if node.CredentialCount != 5 {
		t.Errorf("expected CredentialCount 5, got %d", node.CredentialCount)
	}
}

func TestEdge_Fields(t *testing.T) {
	createdAt := time.Now()
	edge := &Edge{
		From:          "EISSUER",
		To:            "ESUBJECT",
		CredentialID:  "ESAID123",
		Type:          EdgeTypeMembership,
		Bidirectional: true,
		CreatedAt:     createdAt,
	}

	if edge.From != "EISSUER" {
		t.Errorf("expected From EISSUER, got %s", edge.From)
	}
	if edge.To != "ESUBJECT" {
		t.Errorf("expected To ESUBJECT, got %s", edge.To)
	}
	if edge.CredentialID != "ESAID123" {
		t.Errorf("expected CredentialID ESAID123, got %s", edge.CredentialID)
	}
	if edge.Type != EdgeTypeMembership {
		t.Errorf("expected Type membership, got %s", edge.Type)
	}
	if !edge.Bidirectional {
		t.Error("expected Bidirectional true")
	}
	if !edge.CreatedAt.Equal(createdAt) {
		t.Error("CreatedAt mismatch")
	}
}

func TestScore_Fields(t *testing.T) {
	score := &Score{
		AID:                    "EUSER1",
		Alias:                  "alice",
		Role:                   "Member",
		IncomingCredentials:    3,
		OutgoingCredentials:    1,
		UniqueIssuers:          2,
		BidirectionalRelations: 1,
		GraphDepth:             1,
		Score:                  10.5,
	}

	if score.AID != "EUSER1" {
		t.Errorf("expected AID EUSER1, got %s", score.AID)
	}
	if score.IncomingCredentials != 3 {
		t.Errorf("expected IncomingCredentials 3, got %d", score.IncomingCredentials)
	}
	if score.Score != 10.5 {
		t.Errorf("expected Score 10.5, got %f", score.Score)
	}
}
