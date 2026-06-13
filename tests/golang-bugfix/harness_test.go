// Hidden grading harness — copied into the agent's workspace by test.ts as
// harness_test.go and run with `go test`. Not part of context/, so the agent
// never sees it.
package inventory

import (
	"reflect"
	"testing"
)

func sampleItems() []Item {
	return []Item{
		{Name: "widget", Quantity: 3, Price: 2.0},
		{Name: "gadget", Quantity: 1, Price: 10.0},
		{Name: "gizmo", Quantity: 0, Price: 5.0},
	}
}

func TestTotalValue(t *testing.T) {
	got := TotalValue(sampleItems())
	want := 3*2.0 + 1*10.0 + 0*5.0
	if got != want {
		t.Fatalf("TotalValue() = %v, want %v", got, want)
	}
}

func TestLowStock(t *testing.T) {
	got := LowStock(sampleItems(), 2)
	want := []string{"gadget", "gizmo"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("LowStock() = %v, want %v", got, want)
	}
}

func TestMostExpensive(t *testing.T) {
	got := MostExpensive(sampleItems())
	want := "gadget"
	if got != want {
		t.Fatalf("MostExpensive() = %q, want %q", got, want)
	}
}

func TestMostExpensiveEmpty(t *testing.T) {
	got := MostExpensive(nil)
	if got != "" {
		t.Fatalf("MostExpensive(nil) = %q, want \"\"", got)
	}
}
