import frappe


def execute():
    """Ensure Variant Creation Tool doctypes are reloaded for existing sites."""
    for doctype in ("variant_creation_row", "variant_creation_tool"):
        frappe.reload_doc("variant_bulk_creation", "doctype", doctype)
