# Variant Bulk Creation (ERPNext App)

Variant Bulk Creation adds a desk tool to ERPNext that helps merchandisers
prepare and launch many Item Variants from a single-attribute template in just a
few clicks. The app focuses on interactive usage inside ERPNext instead of
standalone APIs.

## Installation

```bash
bench get-app git@github.com:your-org/variant_bulk_creation.git
bench --site your-site install-app variant_bulk_creation
```

After installation log into the site and search for **Variant Creation Tool** in
the Awesomebar. The form guides users through choosing template Items and
entering the attribute values that should become variants.

## Variant Creation Tool

1. (Optional) Select a default Item template that is configured with exactly one
   variant attribute.
2. The tool automatically shows the attribute name and the allowed values for
   the selected template.
3. Add rows to the table for each variant you would like to create. Use the new
   **Template Item** column to pick the appropriate template per row, then
   supply the Attribute Value. Optional columns allow you to override the
   generated Item Code, Item Name, SKU, and Description for each variant.
4. Click **Actions → Create Variants**. The server-side logic validates every
   row, prevents duplicates, creates the missing variants, and reports the
   outcome in the Creation Log field.

### Validation rules

- Only template items with a single attribute are supported.
- Each row must reference a valid template (via the default selection or the
  Template Item column) and choose an attribute value defined on that template.
- Attribute values must exist on the template's attribute definition.
- Existing variants are skipped and listed in the log so the action is safe to
  repeat.

All operations rely on ERPNext's native variant creation utilities, so
post-processing such as accounting dimensions or price lists continues to work
as expected.

## Sales Order integration

The app also extends the standard Sales Order Item child table with **Template
Item** and **Attribute Value** link fields. When a salesperson selects both
values, the system automatically locates (or creates) the corresponding variant
and fills in the Item Code, description, and UOM on the row. This keeps order
entry fast while guaranteeing that every requested configuration exists in the
item master.
