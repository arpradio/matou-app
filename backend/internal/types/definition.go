// Package types provides a type system for MATOU's generic objects.
// Type definitions describe the schema, layout, and permissions for objects
// stored in any-sync ObjectTrees.
package types

// TypeDefinition describes a type of object that can be stored in a space.
type TypeDefinition struct {
	Name        string                `json:"name"`
	Version     int                   `json:"version"`
	Description string                `json:"description"`
	Space       string                `json:"space"` // "private", "community", "community-readonly", "admin"
	Fields      []FieldDef            `json:"fields"`
	Layouts     map[string]Layout     `json:"layouts"`    // "card", "detail", "form"
	Permissions TypePermissions       `json:"permissions"`
}

// FieldDef describes a single field in a type definition.
type FieldDef struct {
	Name       string      `json:"name"`
	Type       string      `json:"type"` // "string", "boolean", "array", "object", "number", "datetime", "enum"
	Required   bool        `json:"required"`
	ReadOnly   bool        `json:"readOnly"`
	Default    interface{} `json:"default,omitempty"`
	Validation *Validation `json:"validation,omitempty"`
	UIHints    *UIHints    `json:"uiHints,omitempty"`
}

// Validation defines constraints for a field value.
type Validation struct {
	MinLength *int     `json:"minLength,omitempty"`
	MaxLength *int     `json:"maxLength,omitempty"`
	Min       *float64 `json:"min,omitempty"`
	Max       *float64 `json:"max,omitempty"`
	Pattern   string   `json:"pattern,omitempty"`
	Enum      []string `json:"enum,omitempty"`
}

// UIHints provides rendering hints for frontend components.
type UIHints struct {
	InputType     string `json:"inputType,omitempty"`     // "text", "textarea", "select", "toggle", "tags", "image-upload"
	DisplayFormat string `json:"displayFormat,omitempty"` // "avatar", "badge", "chip-list", "relative-date", "link"
	Placeholder   string `json:"placeholder,omitempty"`
	Label         string `json:"label,omitempty"`
	Section       string `json:"section,omitempty"`
}

// Layout defines which fields to show and in what order for a given view.
type Layout struct {
	Fields []string `json:"fields"`
}

// TypePermissions defines who can read and write objects of this type.
type TypePermissions struct {
	Read  string `json:"read"`  // "owner", "community", "admin"
	Write string `json:"write"` // "owner", "admin"
}
