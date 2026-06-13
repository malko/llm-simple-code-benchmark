# inventory

Simple stock-tracking helpers.

## Functions (`inventory.go`)

- `TotalValue(items []Item) float64` — sum of `Quantity * Price` across all items.
- `LowStock(items []Item, threshold int) []string` — names of items with
  `Quantity < threshold`, in input order.
- `MostExpensive(items []Item) string` — name of the item with the highest
  `Price`, or `""` if `items` is empty.

See the doc comment above each function for its exact contract.
