from . import __version__ as app_version

app_name = "variant_bulk_creation"
app_title = "Variant Bulk Creation"
app_publisher = "Custom"
app_description = "Bulk creation tools for Item Variants"
app_email = "support@example.com"
app_license = "MIT"

"""Default hook configuration for the Variant Bulk Creation app."""

# Fixtures - custom fields to be installed
fixtures = [
    {
        "dt": "Custom Field",
        "filters": [
            ["name", "in", [
                "Sales Order Item-vbc_template_item",
                "Sales Order Item-vbc_powder_code",
                "Sales Order Item-vbc_sticker",
                "Sales Order Item-vbc_length",
                "Item-weight_config_section",
                "Item-weight_per_meter_with_sticker",
                "Item-weight_per_meter_no_sticker"
            ]]
        ]
    }
]

# Client-side helpers for Sales Orders to create variants directly from item rows.
doctype_js = {
    "Sales Order": "public/js/sales_order.js",
}

doc_events = {
    "Sales Order": {
        "validate": "variant_bulk_creation.variant_bulk_creation.sales_order.ensure_sales_order_variants",
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
        ]]],
    }
]
