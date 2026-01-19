package trust

import (
	"testing"
)

func TestNewDefaultCalculator(t *testing.T) {
	calc := NewDefaultCalculator()
	if calc == nil {
		t.Fatal("NewDefaultCalculator returned nil")
	}
	if calc.weights.IncomingCredential != 1.0 {
		t.Errorf("expected IncomingCredential weight 1.0, got %f", calc.weights.IncomingCredential)
	}
}

func TestDefaultWeights(t *testing.T) {
	weights := DefaultWeights()
	if weights.IncomingCredential != 1.0 {
		t.Errorf("expected IncomingCredential 1.0, got %f", weights.IncomingCredential)
	}
	if weights.UniqueIssuer != 2.0 {
		t.Errorf("expected UniqueIssuer 2.0, got %f", weights.UniqueIssuer)
	}
	if weights.BidirectionalRelation != 3.0 {
		t.Errorf("expected BidirectionalRelation 3.0, got %f", weights.BidirectionalRelation)
	}
}

func TestCalculator_CalculateScore_BasicMember(t *testing.T) {
	graph := NewGraph("EORG123")

	// Add org node
	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})

	// Add member node
	graph.AddNode(&Node{AID: "EUSER1", Alias: "alice", Role: "Member"})

	// Add membership edge from org to user
	graph.AddEdge(&Edge{
		From:         "EORG123",
		To:           "EUSER1",
		CredentialID: "ESAID001",
		Type:         EdgeTypeMembership,
	})

	calc := NewDefaultCalculator()
	score := calc.CalculateScore("EUSER1", graph)

	if score.AID != "EUSER1" {
		t.Errorf("expected AID EUSER1, got %s", score.AID)
	}
	if score.Alias != "alice" {
		t.Errorf("expected Alias alice, got %s", score.Alias)
	}
	if score.IncomingCredentials != 1 {
		t.Errorf("expected 1 incoming credential, got %d", score.IncomingCredentials)
	}
	if score.UniqueIssuers != 1 {
		t.Errorf("expected 1 unique issuer, got %d", score.UniqueIssuers)
	}
	if score.GraphDepth != 1 {
		t.Errorf("expected depth 1, got %d", score.GraphDepth)
	}
	if score.Score <= 0 {
		t.Errorf("expected positive score, got %f", score.Score)
	}
}

func TestCalculator_CalculateScore_OrgNode(t *testing.T) {
	graph := NewGraph("EORG123")
	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})

	calc := NewDefaultCalculator()
	score := calc.CalculateScore("EORG123", graph)

	if score.GraphDepth != 0 {
		t.Errorf("expected depth 0 for org, got %d", score.GraphDepth)
	}
}

func TestCalculator_CalculateScore_BidirectionalRelation(t *testing.T) {
	graph := NewGraph("EORG123")

	// Add nodes
	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EUSER1", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER2", Role: "Member"})

	// Org -> User1
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1", Type: EdgeTypeMembership})
	// Org -> User2
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER2", CredentialID: "E2", Type: EdgeTypeMembership})
	// User1 -> User2 (invitation)
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER2", CredentialID: "E3", Type: EdgeTypeInvitation})
	// User2 -> User1 (invitation)
	graph.AddEdge(&Edge{From: "EUSER2", To: "EUSER1", CredentialID: "E4", Type: EdgeTypeInvitation})

	graph.MarkBidirectionalEdges()

	calc := NewDefaultCalculator()

	// User1 score
	score1 := calc.CalculateScore("EUSER1", graph)
	if score1.IncomingCredentials != 2 {
		t.Errorf("expected 2 incoming credentials for EUSER1, got %d", score1.IncomingCredentials)
	}
	if score1.BidirectionalRelations != 1 {
		t.Errorf("expected 1 bidirectional relation for EUSER1, got %d", score1.BidirectionalRelations)
	}

	// User2 score
	score2 := calc.CalculateScore("EUSER2", graph)
	if score2.IncomingCredentials != 2 {
		t.Errorf("expected 2 incoming credentials for EUSER2, got %d", score2.IncomingCredentials)
	}
}

func TestCalculator_CalculateScore_MultipleIssuers(t *testing.T) {
	graph := NewGraph("EORG123")

	// Add nodes
	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EUSER1", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER2", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER3", Role: "Member"})

	// Multiple edges to User3 from different issuers
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER3", CredentialID: "E1", Type: EdgeTypeMembership})
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER3", CredentialID: "E2", Type: EdgeTypeInvitation})
	graph.AddEdge(&Edge{From: "EUSER2", To: "EUSER3", CredentialID: "E3", Type: EdgeTypeInvitation})

	calc := NewDefaultCalculator()
	score := calc.CalculateScore("EUSER3", graph)

	if score.UniqueIssuers != 3 {
		t.Errorf("expected 3 unique issuers, got %d", score.UniqueIssuers)
	}
}

func TestCalculator_CalculateScore_DeepGraph(t *testing.T) {
	graph := NewGraph("EORG123")

	// Create a chain: Org -> User1 -> User2 -> User3
	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EUSER1", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER2", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER3", Role: "Member"})

	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER2", CredentialID: "E2"})
	graph.AddEdge(&Edge{From: "EUSER2", To: "EUSER3", CredentialID: "E3"})

	calc := NewDefaultCalculator()

	// Check depths
	score1 := calc.CalculateScore("EUSER1", graph)
	if score1.GraphDepth != 1 {
		t.Errorf("expected depth 1 for EUSER1, got %d", score1.GraphDepth)
	}

	score2 := calc.CalculateScore("EUSER2", graph)
	if score2.GraphDepth != 2 {
		t.Errorf("expected depth 2 for EUSER2, got %d", score2.GraphDepth)
	}

	score3 := calc.CalculateScore("EUSER3", graph)
	if score3.GraphDepth != 3 {
		t.Errorf("expected depth 3 for EUSER3, got %d", score3.GraphDepth)
	}
}

func TestCalculator_CalculateScore_UnreachableNode(t *testing.T) {
	graph := NewGraph("EORG123")

	// Add disconnected node
	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EDISCONNECTED", Role: "Member"})
	// No edge connecting to org

	calc := NewDefaultCalculator()
	score := calc.CalculateScore("EDISCONNECTED", graph)

	if score.GraphDepth != -1 {
		t.Errorf("expected depth -1 for unreachable node, got %d", score.GraphDepth)
	}
}

func TestCalculator_CalculateAllScores(t *testing.T) {
	graph := NewGraph("EORG123")

	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EUSER1", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER2", Role: "Member"})

	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER2", CredentialID: "E2"})

	calc := NewDefaultCalculator()
	scores := calc.CalculateAllScores(graph)

	if len(scores) != 3 {
		t.Errorf("expected 3 scores, got %d", len(scores))
	}
	if scores["EORG123"] == nil {
		t.Error("expected score for EORG123")
	}
	if scores["EUSER1"] == nil {
		t.Error("expected score for EUSER1")
	}
	if scores["EUSER2"] == nil {
		t.Error("expected score for EUSER2")
	}
}

func TestCalculator_GetTopScores(t *testing.T) {
	graph := NewGraph("EORG123")

	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EUSER1", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER2", Role: "Member"})

	// Give User1 more credentials (higher score)
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER2", CredentialID: "E2"})
	graph.AddEdge(&Edge{From: "EUSER2", To: "EUSER1", CredentialID: "E3"})
	graph.MarkBidirectionalEdges()

	calc := NewDefaultCalculator()

	// Get top 2
	topScores := calc.GetTopScores(graph, 2)
	if len(topScores) != 2 {
		t.Errorf("expected 2 top scores, got %d", len(topScores))
	}

	// First should have higher or equal score than second
	if topScores[0].Score < topScores[1].Score {
		t.Error("scores should be sorted descending")
	}

	// Limit higher than available
	allScores := calc.GetTopScores(graph, 100)
	if len(allScores) != 3 {
		t.Errorf("expected 3 scores, got %d", len(allScores))
	}
}

func TestCalculator_CalculateSummary(t *testing.T) {
	graph := NewGraph("EORG123")

	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EUSER1", Role: "Member"})
	graph.AddNode(&Node{AID: "EUSER2", Role: "Member"})

	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER2", CredentialID: "E2"})
	graph.AddEdge(&Edge{From: "EUSER1", To: "EUSER2", CredentialID: "E3"})
	graph.AddEdge(&Edge{From: "EUSER2", To: "EUSER1", CredentialID: "E4"})
	graph.MarkBidirectionalEdges()

	calc := NewDefaultCalculator()
	summary := calc.CalculateSummary(graph)

	if summary.TotalNodes != 3 {
		t.Errorf("expected 3 total nodes, got %d", summary.TotalNodes)
	}
	if summary.TotalEdges != 4 {
		t.Errorf("expected 4 total edges, got %d", summary.TotalEdges)
	}
	if summary.AverageScore <= 0 {
		t.Errorf("expected positive average score, got %f", summary.AverageScore)
	}
	if summary.MaxScore < summary.MinScore {
		t.Error("max score should be >= min score")
	}
	if summary.BidirectionalCount != 1 {
		t.Errorf("expected 1 bidirectional pair, got %d", summary.BidirectionalCount)
	}
}

func TestCalculator_CalculateSummary_EmptyGraph(t *testing.T) {
	graph := NewGraph("EORG123")

	calc := NewDefaultCalculator()
	summary := calc.CalculateSummary(graph)

	if summary.TotalNodes != 0 {
		t.Errorf("expected 0 nodes, got %d", summary.TotalNodes)
	}
	if summary.TotalEdges != 0 {
		t.Errorf("expected 0 edges, got %d", summary.TotalEdges)
	}
}

func TestCalculator_CustomWeights(t *testing.T) {
	weights := ScoreWeights{
		IncomingCredential:    5.0,
		UniqueIssuer:          10.0,
		BidirectionalRelation: 20.0,
		DepthPenalty:          0.5,
		OrgIssuedBonus:        15.0,
	}

	calc := NewCalculator(weights)

	graph := NewGraph("EORG123")
	graph.AddNode(&Node{AID: "EORG123", Role: "Organization"})
	graph.AddNode(&Node{AID: "EUSER1", Role: "Member"})
	graph.AddEdge(&Edge{From: "EORG123", To: "EUSER1", CredentialID: "E1"})

	score := calc.CalculateScore("EUSER1", graph)

	// With custom weights:
	// IncomingCredential: 1 * 5.0 = 5.0
	// UniqueIssuer: 1 * 10.0 = 10.0
	// OrgIssuedBonus: 15.0
	// DepthPenalty: 1 * 0.5 = -0.5
	// Total: 5 + 10 + 15 - 0.5 = 29.5
	expectedScore := 29.5
	if score.Score != expectedScore {
		t.Errorf("expected score %f, got %f", expectedScore, score.Score)
	}
}
