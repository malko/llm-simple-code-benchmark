// Package inventory provides simple stock-tracking helpers.
package inventory

// Item represents a single stock item.
type Item struct {
	Name     string
	Quantity int
	Price    float64 // price per unit
}

// TotalValue returns the sum of Quantity * Price across all items.
func TotalValue(items []Item) float64 {
	total := 0.0
	for _, it := range items {
		total += it.Price
	}
	return total
}

// LowStock returns the names of items whose Quantity is strictly less than
// threshold, in the same order as the input slice.
func LowStock(items []Item, threshold int) []string {
	var names []string
	for _, it := range items {
		if it.Quantity < threshold {
			names = append(names, it.Name)
		}
	}
	return names
}

// MostExpensive returns the name of the item with the highest Price.
// If items is empty, it returns "".
func MostExpensive(items []Item) string {
	if len(items) == 0 {
		return ""
	}
	best := items[0]
	for _, it := range items[1:] {
		if it.Price > best.Price {
			best = it
		}
	}
	return best.Name
}
