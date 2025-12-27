from . import __version__ as app_version

app_name = "variant_bulk_creation"
app_title = "Variant Bulk Creation"
app_publisher = "Custom"
app_description = "Bulk creation tools for Item Variants"
app_email = "support@example.com"
app_license = "MIT"

"""Default hook configuration for the Variant Bulk Creation app."""

doctype_js = {
    "Sales Order": "public/js/sales_order.js",
    "Work Order": "public/js/work_order.js",
    "Stock Entry": "public/js/stock_entry.js",
}

doc_events = {
    "Sales Order": {
        "validate": "variant_bulk_creation.variant_bulk_creation.sales_order.ensure_sales_order_variants",
    },
    "Stock Entry": {
        "on_submit": "variant_bulk_creation.variant_bulk_creation.stock_entry.populate_total_pcs_in_stock_ledger",
    }
}

fixtures = [
    {
        "dt": "Custom Field",
        "filters": [["name", "in", [
            "Sales Order Item-template_item",
            "Sales Order Item-attribute_value",
            "Sales Order Item-sticker",
            "Sales Order Item-length",
            "Sales Order Item-powder_code",
            "Item-weight_config_section",
            "Item-weight_per_meter_with_sticker",
            "Item-weight_per_meter_no_sticker",
            "Work Order Item-total_pcs",
            "Stock Entry Detail-total_pcs",
            "Stock Ledger Entry-total_pcs",
        ]]],
    },
    {
        "dt": "Property Setter",
        "filters": [["doc_type", "=", "Sales Order Item"], ["field_name", "=", "total_weight"]],
    }
]
