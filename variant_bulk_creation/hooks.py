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
    "Delivery Note": "public/js/delivery_note.js",
    "BOM": "public/js/bom.js",
    "Stock Reconciliation": "public/js/stock_reconciliation.js",
}

doc_events = {
    "Sales Order": {
        "validate": "variant_bulk_creation.variant_bulk_creation.sales_order.ensure_sales_order_variants",
    },
    "Work Order": {
        "before_save": "variant_bulk_creation.variant_bulk_creation.work_order.populate_total_pcs_from_sales_order",
    },
    "Stock Entry": {
        "before_save": "variant_bulk_creation.variant_bulk_creation.work_order.populate_total_pcs_in_stock_entry",
        "on_submit": "variant_bulk_creation.variant_bulk_creation.stock_entry.populate_total_pcs_in_stock_ledger",
    },
    "Delivery Note": {
        "on_submit": "variant_bulk_creation.variant_bulk_creation.delivery_note.populate_total_pcs_in_stock_ledger",
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
            "Delivery Note Item-total_pcs",
            "BOM Item-total_pcs",
            "BOM-total_pcs",
            "BOM-department",
            "Work Order-total_pcs",
            "Work Order-total_pcs_produced",
            "Work Order-department",
            "Stock Reconciliation Item-total_pcs",
        ]]],
    },
    {
        "dt": "Property Setter",
        "filters": [["doc_type", "=", "Sales Order Item"], ["field_name", "=", "total_weight"]],
    }
]
