package trust

import (
	"time"
)

// Node represents an identity in the trust graph
type Node struct {
	AID             string    `json:"aid"`
	Alias           string    `json:"alias,omitempty"`
	Role            string    `json:"role"`
	JoinedAt        time.Time `json:"joinedAt"`
	CredentialCount int       `json:"credentialCount"`
}

// Edge represents a credential relationship between two identities
type Edge struct {
	From          string    `json:"from"`          // Issuer AID
	To            string    `json:"to"`            // Subject AID
	CredentialID  string    `json:"credentialId"`  // ACDC SAID
	Type          string    `json:"type"`          // membership, invitation, steward, endorsement
	Bidirectional bool      `json:"bidirectional"` // Mutual relationship
	CreatedAt     time.Time `json:"createdAt"`
}

// Graph is the complete trust graph containing nodes and edges
type Graph struct {
	Nodes   map[string]*Node `json:"nodes"`
	Edges   []*Edge          `json:"edges"`
	OrgAID  string           `json:"orgAid"`
	Updated time.Time        `json:"updated"`
}

// NewGraph creates a new empty trust graph
func NewGraph(orgAID string) *Graph {
	return &Graph{
		Nodes:   make(map[string]*Node),
		Edges:   make([]*Edge, 0),
		OrgAID:  orgAID,
		Updated: time.Now().UTC(),
	}
}

// AddNode adds or updates a node in the graph
func (g *Graph) AddNode(node *Node) {
	if existing, ok := g.Nodes[node.AID]; ok {
		// Update existing node
		if node.Alias != "" {
			existing.Alias = node.Alias
		}
		if node.Role != "" {
			existing.Role = node.Role
		}
		existing.CredentialCount++
	} else {
		node.CredentialCount = 1
		g.Nodes[node.AID] = node
	}
}

// AddEdge adds an edge to the graph
func (g *Graph) AddEdge(edge *Edge) {
	// Check for duplicate edge
	for _, e := range g.Edges {
		if e.CredentialID == edge.CredentialID {
			return // Edge already exists
		}
	}
	g.Edges = append(g.Edges, edge)
}

// GetNode returns a node by AID
func (g *Graph) GetNode(aid string) *Node {
	return g.Nodes[aid]
}

// GetEdgesFrom returns all edges from a given AID (outgoing)
func (g *Graph) GetEdgesFrom(aid string) []*Edge {
	edges := make([]*Edge, 0)
	for _, e := range g.Edges {
		if e.From == aid {
			edges = append(edges, e)
		}
	}
	return edges
}

// GetEdgesTo returns all edges to a given AID (incoming)
func (g *Graph) GetEdgesTo(aid string) []*Edge {
	edges := make([]*Edge, 0)
	for _, e := range g.Edges {
		if e.To == aid {
			edges = append(edges, e)
		}
	}
	return edges
}

// HasBidirectionalRelation checks if two AIDs have a bidirectional relationship
func (g *Graph) HasBidirectionalRelation(aid1, aid2 string) bool {
	hasForward := false
	hasReverse := false

	for _, e := range g.Edges {
		if e.From == aid1 && e.To == aid2 {
			hasForward = true
		}
		if e.From == aid2 && e.To == aid1 {
			hasReverse = true
		}
	}

	return hasForward && hasReverse
}

// MarkBidirectionalEdges updates edges to mark bidirectional relationships
func (g *Graph) MarkBidirectionalEdges() {
	// Build a map of edge pairs
	edgeMap := make(map[string]bool) // "from:to" -> exists

	for _, e := range g.Edges {
		key := e.From + ":" + e.To
		edgeMap[key] = true
	}

	// Mark bidirectional edges
	for _, e := range g.Edges {
		reverseKey := e.To + ":" + e.From
		if edgeMap[reverseKey] {
			e.Bidirectional = true
		}
	}
}

// NodeCount returns the number of nodes in the graph
func (g *Graph) NodeCount() int {
	return len(g.Nodes)
}

// EdgeCount returns the number of edges in the graph
func (g *Graph) EdgeCount() int {
	return len(g.Edges)
}

// Score represents a trust score for an individual AID
type Score struct {
	AID                    string  `json:"aid"`
	Alias                  string  `json:"alias,omitempty"`
	Role                   string  `json:"role,omitempty"`
	IncomingCredentials    int     `json:"incomingCredentials"`
	OutgoingCredentials    int     `json:"outgoingCredentials"`
	UniqueIssuers          int     `json:"uniqueIssuers"`
	BidirectionalRelations int     `json:"bidirectionalRelations"`
	GraphDepth             int     `json:"graphDepth"`
	Score                  float64 `json:"score"`
}

// EdgeType constants for credential types
const (
	EdgeTypeMembership  = "membership"
	EdgeTypeSteward     = "steward"
	EdgeTypeInvitation  = "invitation"
	EdgeTypeSelfClaim   = "self_claim"
	EdgeTypeEndorsement = "endorsement"
	EdgeTypeRevocation  = "revocation"
)

// SchemaToEdgeType maps credential schemas to edge types
func SchemaToEdgeType(schema string) string {
	switch schema {
	case "EMatouMembershipSchemaV1":
		return EdgeTypeMembership
	case "EOperationsStewardSchemaV1":
		return EdgeTypeSteward
	case "EInvitationSchemaV1":
		return EdgeTypeInvitation
	case "ESelfClaimSchemaV1":
		return EdgeTypeSelfClaim
	case "EPIm7hiwSUt5css49iLXFPaPDFOJx0MmfNoB3PkSMXkh":
		return EdgeTypeEndorsement
	case "ECTr_8xypBFYjSIwJkJ5OwD-PUb-8eceHIKc-vZh_BDK":
		return EdgeTypeRevocation
	default:
		return "unknown"
	}
}
